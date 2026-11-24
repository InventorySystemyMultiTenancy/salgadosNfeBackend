import * as orderRepository from "../repositories/order.repository.js";
import * as productRepository from "../repositories/product.repository.js";
import * as clientRepository from "../repositories/client.repository.js";
import * as terminalPaymentRepository from "../repositories/terminalPayment.repository.js";
import { TERMINAL_PAYMENT_METHODS, resolvePaymentMethod } from "../payments/paymentMethod.js";
import { parseId, parseOptionalRange, parsePage } from "./filters.js";
import * as storeSettingsService from "./storeSettings.service.js";

const ALL_PAYMENT_METHODS = ["CASH", "DEBIT", "CREDIT", "PIX", "TAB"];
const KITCHEN_STATUSES = ["PENDING", "PREPARING", "READY"];

const FISCAL_STATUSES = ["NOT_EMITTED", "PENDING", "AUTHORIZED", "REJECTED"];

// Sem acento e minúsculo: "conceicao" acha "Conceição".
function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Monta o filtro da tela de Pedidos. Busca livre: número → pedido exato; texto → nome do cliente
// (ids já resolvidos sem acento em `matchingClientIds`) ou parte do CPF/CNPJ.
export function buildOrderFilter(
  { clientId, sellerId, from, to, paymentMethod, fiscalStatus, status, q } = {},
  { matchingClientIds = [] } = {},
) {
  const and = [];
  const createdAt = parseOptionalRange({ from, to });
  if (createdAt) and.push({ createdAt });

  const client = parseId(clientId);
  if (client) and.push({ clientId: client });
  const seller = parseId(sellerId);
  if (seller) and.push({ sellerId: seller });

  if (paymentMethod) {
    if (!ALL_PAYMENT_METHODS.includes(paymentMethod)) throw new Error("Forma de pagamento inválida.");
    and.push({ paymentMethod });
  }
  if (fiscalStatus) {
    if (!FISCAL_STATUSES.includes(fiscalStatus)) throw new Error("Status fiscal inválido.");
    and.push({ fiscalStatus });
  }
  if (status === "active") and.push({ canceledAt: null });
  else if (status === "canceled") and.push({ canceledAt: { not: null } });
  else if (status) throw new Error("Situação inválida.");

  const term = q?.trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const or = [{ clientId: { in: matchingClientIds } }];
    if (/^#?\d+$/.test(term)) or.push({ id: Number(digits) });
    if (digits.length >= 3) {
      or.push({ client: { cpf: { contains: digits } } }, { client: { cnpj: { contains: digits } } });
    }
    and.push({ OR: or });
  }

  return and.length ? { AND: and } : {};
}

export async function listOrders(filters = {}) {
  // O Postgres compara com acento; a tabela de clientes é pequena, então o nome é casado aqui.
  let matchingClientIds = [];
  const term = normalizeText(filters.q);
  if (term) {
    const clients = await clientRepository.findAllNames();
    matchingClientIds = clients.filter((c) => normalizeText(c.name).includes(term)).map((c) => c.id);
  }
  const where = buildOrderFilter(filters, { matchingClientIds });
  const page = parsePage(filters);
  const result = await orderRepository.findPage(where, page);
  return { ...result, page: page.page, pageSize: page.pageSize };
}

export function getOrder(id) {
  return orderRepository.findById(Number(id));
}

export function getKitchenQueue() {
  return orderRepository.findKitchenQueue();
}

export function setKitchenStatus(id, status) {
  if (!KITCHEN_STATUSES.includes(status)) {
    throw new Error("Status de cozinha inválido.");
  }
  return orderRepository.updateKitchenStatus(Number(id), status);
}

export async function getStockAuditBySeller({ from, to, sellerId } = {}) {
  const orderItems = await orderRepository.findAllItemsWithSellerAndProduct({
    createdAt: parseOptionalRange({ from, to }),
    sellerId: parseId(sellerId),
  });

  const grouped = new Map();
  for (const item of orderItems) {
    const seller = item.order.seller;
    const key = `${seller.id}-${item.product.id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalQuantity += item.quantity;
    } else {
      grouped.set(key, {
        sellerId: seller.id,
        sellerName: seller.name,
        productId: item.product.id,
        productName: item.product.name,
        totalQuantity: item.quantity,
      });
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => a.sellerName.localeCompare(b.sellerName) || a.productName.localeCompare(b.productName),
  );
}

export async function cancelOrder(id, { userId, reason }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    throw new Error("Informe o motivo do cancelamento.");
  }

  const order = await orderRepository.findById(Number(id));
  if (!order) {
    throw new Error("Pedido não encontrado.");
  }
  if (order.canceledAt) {
    throw new Error("Este pedido já foi cancelado.");
  }
  // Nota autorizada (ou ainda em processamento) na SEFAZ não some só cancelando aqui — precisa ser
  // cancelada no gateway fiscal primeiro, senão o sistema e a SEFAZ ficam divergentes.
  if (order.fiscalStatus === "AUTHORIZED" || order.fiscalStatus === "PENDING") {
    throw new Error(
      "Este pedido tem nota fiscal emitida. Cancele a nota no painel do emissor fiscal antes de cancelar o pedido.",
    );
  }

  return orderRepository.cancel(order.id, { canceledById: userId, cancelReason: trimmedReason });
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Desconto no pedido: valor em R$ (o PDV converte % pra R$), motivo obrigatório e, acima do limite
// configurado, autorização de um administrador (o próprio, se quem vende é admin).
async function resolveDiscount({ discount, subtotal, sellerId, sellerRole, approvalToken }) {
  const discountAmount = round2(Number(discount?.amount) || 0);
  if (discountAmount === 0) return { discountAmount: 0, discountReason: null, discountApprovedById: null };
  if (discountAmount < 0 || discountAmount > subtotal) {
    throw new Error("Desconto inválido: precisa estar entre zero e o subtotal do pedido.");
  }
  const discountReason = discount?.reason?.trim();
  if (!discountReason) {
    throw new Error("Informe o motivo do desconto.");
  }

  let discountApprovedById = null;
  const { maxDiscountPercent } = await storeSettingsService.getSettings();
  const percent = (discountAmount / subtotal) * 100;
  if (percent > maxDiscountPercent + 0.001) {
    discountApprovedById =
      sellerRole === "ADMIN" ? sellerId : storeSettingsService.verifyDiscountApproval(approvalToken, discountAmount);
    if (!discountApprovedById) {
      throw new Error(
        `Desconto de ${percent.toFixed(1)}% passa do limite de ${maxDiscountPercent}% — precisa da autorização de um administrador.`,
      );
    }
  }
  return { discountAmount, discountReason, discountApprovedById };
}

export async function createOrder({
  sellerId,
  sellerRole,
  paymentMethod,
  clientId,
  items,
  terminalPaymentId,
  discount,
  approvalToken,
}) {
  if (!ALL_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error("Forma de pagamento inválida.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("O pedido precisa ter ao menos um item.");
  }

  const resolvedItems = [];
  // O que sai do estoque: o próprio produto, ou os componentes quando é combo. Somado por produto
  // pra conferir o estoque de uma vez (ex: coxinha avulsa + combo com coxinha no mesmo pedido).
  const stockLines = [];
  const needed = new Map();
  const stockInfo = new Map();
  let subtotal = 0;

  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantidade inválida.");
    }
    const product = await productRepository.findById(Number(item.productId));
    if (!product || !product.active) {
      throw new Error(`Produto ${item.productId} não encontrado.`);
    }

    if (product.isCombo) {
      if (!product.comboItems?.length) {
        throw new Error(`O combo ${product.name} está sem produtos cadastrados.`);
      }
      for (const comboItem of product.comboItems) {
        const component = comboItem.component;
        if (!component.active) {
          throw new Error(`O combo ${product.name} tem um produto que foi desativado (${component.name}).`);
        }
        const componentQuantity = comboItem.quantity * quantity;
        stockInfo.set(component.id, component);
        needed.set(component.id, (needed.get(component.id) ?? 0) + componentQuantity);
        stockLines.push({ productId: component.id, quantity: componentQuantity, reason: `Combo: ${product.name}` });
      }
    } else {
      stockInfo.set(product.id, product);
      needed.set(product.id, (needed.get(product.id) ?? 0) + quantity);
      stockLines.push({ productId: product.id, quantity, reason: null });
    }

    const unitPrice = Number(product.price);
    subtotal += unitPrice * quantity;
    resolvedItems.push({ productId: product.id, quantity, unitPrice });
  }

  for (const [productId, quantity] of needed) {
    const product = stockInfo.get(productId);
    if (product.stockQuantity < quantity) {
      throw new Error(`Estoque insuficiente para ${product.name}.`);
    }
  }

  subtotal = round2(subtotal);
  const { discountAmount, discountReason, discountApprovedById } = await resolveDiscount({
    discount,
    subtotal,
    sellerId,
    sellerRole,
    approvalToken,
  });
  const totalAmount = round2(subtotal - discountAmount);

  // Venda cobrada na maquininha: só entra com a cobrança aprovada, do mesmo valor e ainda não
  // usada em outra venda. A forma de pagamento gravada é a que o cliente usou no aparelho.
  if (terminalPaymentId) {
    if (!TERMINAL_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new Error("Forma de pagamento não pode ser cobrada na maquininha.");
    }
    const terminalPayment = await terminalPaymentRepository.findById(Number(terminalPaymentId));
    if (!terminalPayment) {
      throw new Error("Cobrança da maquininha não encontrada.");
    }
    if (terminalPayment.status !== "APPROVED") {
      throw new Error("O pagamento na maquininha não foi aprovado.");
    }
    if (terminalPayment.orderId) {
      throw new Error("Esta cobrança da maquininha já foi usada em outra venda.");
    }
    if (Math.abs(Number(terminalPayment.amount) - totalAmount) > 0.009) {
      throw new Error(
        `O valor cobrado na maquininha (R$ ${Number(terminalPayment.amount).toFixed(2)}) não confere com o total do pedido (R$ ${totalAmount.toFixed(2)}).`,
      );
    }
    paymentMethod = resolvePaymentMethod(terminalPayment.paymentType, paymentMethod);
  }

  let paymentStatus = "PAID";

  if (paymentMethod === "TAB") {
    if (!clientId) {
      throw new Error("Selecione um cliente para venda fiado.");
    }

    const client = await clientRepository.findById(Number(clientId));
    if (!client || !client.active) {
      throw new Error("Cliente não encontrado ou inativo.");
    }

    const projectedBalance = Number(client.currentBalance) + totalAmount;
    if (projectedBalance > Number(client.creditLimit)) {
      throw new Error(`Limite de crédito insuficiente para ${client.name}.`);
    }

    paymentStatus = "PENDING";
  } else if (clientId) {
    // Venda à vista também pode ser vinculada a um cliente cadastrado (CPF/CNPJ) — sem checagem
    // de limite/saldo, só pra identificar o comprador na nota fiscal.
    const client = await clientRepository.findById(Number(clientId));
    if (!client || !client.active) {
      throw new Error("Cliente não encontrado ou inativo.");
    }
  }

  return orderRepository.createWithItems({
    sellerId,
    clientId: clientId ? Number(clientId) : null,
    paymentMethod,
    paymentStatus,
    items: resolvedItems,
    stockLines,
    totalAmount,
    subtotalAmount: subtotal,
    discountAmount,
    discountReason,
    discountApprovedById,
    terminalPaymentId: terminalPaymentId ? Number(terminalPaymentId) : null,
  });
}
