import * as preorderRepository from "../repositories/preorder.repository.js";
import * as productRepository from "../repositories/product.repository.js";
import * as clientRepository from "../repositories/client.repository.js";

const MONEY_METHODS = ["CASH", "DEBIT", "CREDIT", "PIX"];
const PRODUCTION_STATUSES = ["PENDING", "IN_PRODUCTION", "READY"];
const PRODUCTION_WINDOW_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function round(value) {
  return Math.round(value * 100) / 100;
}

function assertOpen(preorder) {
  if (!preorder) {
    throw new Error("Encomenda não encontrada.");
  }
  if (preorder.status === "DELIVERED") {
    throw new Error("Esta encomenda já foi entregue.");
  }
  if (preorder.status === "CANCELED") {
    throw new Error("Esta encomenda foi cancelada.");
  }
}

// Valida e monta os campos comuns de criar/editar: cliente, data e itens (preço pode ser
// negociado por item — ex: cento sai mais barato que a unidade da vitrine).
async function resolveFields(data) {
  let customerName = data.customerName?.trim();
  let customerPhone = data.customerPhone?.trim() || null;
  let clientId = null;

  if (data.clientId) {
    const client = await clientRepository.findById(Number(data.clientId));
    if (!client || !client.active) {
      throw new Error("Cliente não encontrado ou inativo.");
    }
    clientId = client.id;
    customerName ||= client.name;
    customerPhone ||= client.phone;
  }

  if (!customerName) {
    throw new Error("Informe o nome de quem encomendou.");
  }

  const deliveryAt = new Date(data.deliveryAt);
  if (!data.deliveryAt || Number.isNaN(deliveryAt.getTime())) {
    throw new Error("Informe a data e hora da entrega.");
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("A encomenda precisa ter ao menos um item.");
  }

  const items = [];
  let totalAmount = 0;
  for (const item of data.items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantidade inválida.");
    }
    const product = await productRepository.findById(Number(item.productId));
    if (!product) {
      throw new Error(`Produto ${item.productId} não encontrado.`);
    }
    const unitPrice =
      item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === ""
        ? Number(product.price)
        : Number(item.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Preço inválido para ${product.name}.`);
    }
    totalAmount += unitPrice * quantity;
    items.push({ productId: product.id, quantity, unitPrice: round(unitPrice) });
  }

  return {
    clientId,
    customerName,
    customerPhone,
    deliveryAt,
    notes: data.notes?.trim() || null,
    items,
    totalAmount: round(totalAmount),
  };
}

export function listPreorders({ scope, from, to } = {}) {
  if (scope === "range") {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Período inválido.");
    }
    return preorderRepository.findByDeliveryRange({ from: start, to: end });
  }
  if (scope === "recent") {
    const now = Date.now();
    return preorderRepository.findByDeliveryRange({
      from: new Date(now - 30 * DAY_MS),
      to: new Date(now + 365 * DAY_MS),
    });
  }
  return preorderRepository.findOpen();
}

export function getProductionQueue() {
  return preorderRepository.findProductionQueue(new Date(Date.now() + PRODUCTION_WINDOW_MS));
}

export async function createPreorder({ userId, ...data }) {
  const fields = await resolveFields(data);

  const depositAmount = round(Number(data.depositAmount) || 0);
  if (depositAmount < 0 || depositAmount > fields.totalAmount) {
    throw new Error("O sinal precisa estar entre zero e o total da encomenda.");
  }
  if (depositAmount > 0 && !MONEY_METHODS.includes(data.depositMethod)) {
    throw new Error("Informe a forma de pagamento do sinal.");
  }

  return preorderRepository.create({
    ...fields,
    depositAmount,
    depositMethod: depositAmount > 0 ? data.depositMethod : null,
    depositPaidAt: depositAmount > 0 ? new Date() : null,
    createdById: userId,
  });
}

// O sinal não é editável aqui: ele já entrou num caixa. Se o total novo ficar menor que o sinal,
// recusa (o certo é cancelar e devolver pela sangria).
export async function updatePreorder(id, data) {
  const existing = await preorderRepository.findById(Number(id));
  assertOpen(existing);

  const fields = await resolveFields(data);
  if (fields.totalAmount < Number(existing.depositAmount)) {
    throw new Error("O novo total ficou menor que o sinal já pago.");
  }
  return preorderRepository.update(existing.id, fields);
}

export async function setStatus(id, status) {
  if (!PRODUCTION_STATUSES.includes(status)) {
    throw new Error("Status inválido.");
  }
  const existing = await preorderRepository.findById(Number(id));
  assertOpen(existing);
  return preorderRepository.updateFields(existing.id, { status });
}

export async function deliverPreorder(id, { balanceMethod }) {
  const existing = await preorderRepository.findById(Number(id));
  assertOpen(existing);

  const balance = round(Number(existing.totalAmount) - Number(existing.depositAmount));
  if (balance > 0 && !MONEY_METHODS.includes(balanceMethod)) {
    throw new Error("Informe a forma de pagamento do saldo.");
  }

  return preorderRepository.updateFields(existing.id, {
    status: "DELIVERED",
    deliveredAt: new Date(),
    balanceMethod: balance > 0 ? balanceMethod : null,
  });
}

export async function cancelPreorder(id) {
  const existing = await preorderRepository.findById(Number(id));
  assertOpen(existing);
  return preorderRepository.updateFields(existing.id, { status: "CANCELED", canceledAt: new Date() });
}
