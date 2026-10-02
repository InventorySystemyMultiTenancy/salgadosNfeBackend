import * as cashRepository from "../repositories/cash.repository.js";
import * as orderRepository from "../repositories/order.repository.js";
import * as clientPaymentRepository from "../repositories/clientPayment.repository.js";
import * as preorderRepository from "../repositories/preorder.repository.js";

const MONEY_METHODS = ["CASH", "DEBIT", "CREDIT", "PIX"];
const MOVEMENT_TYPES = ["SUPPLY", "WITHDRAWAL"];

function round(value) {
  return Math.round(value * 100) / 100;
}

function emptyByMethod() {
  return Object.fromEntries([...MONEY_METHODS, "TAB"].map((method) => [method, 0]));
}

function parseAmount(value, label) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} inválido.`);
  }
  return round(amount);
}

// Tudo que entrou e saiu durante o turno, por forma de pagamento. Só o dinheiro vivo compõe o
// "esperado na gaveta"; cartão e Pix aparecem pra conferir com o extrato da maquininha/banco.
export async function buildSummary(session, now = new Date()) {
  const range = { from: session.openedAt, to: session.closedAt ?? now };

  const [orders, clientPayments, preorders, canceled] = await Promise.all([
    orderRepository.findInRange(range),
    clientPaymentRepository.findInRange(range),
    preorderRepository.findPaymentsInRange(range),
    orderRepository.aggregateCanceledInRange(range),
  ]);

  const sales = emptyByMethod();
  const salesCount = emptyByMethod();
  for (const order of orders) {
    sales[order.paymentMethod] += Number(order.totalAmount);
    salesCount[order.paymentMethod] += 1;
  }

  const tabReceipts = emptyByMethod();
  for (const payment of clientPayments) {
    // Recebimentos antigos (antes de existir o campo) não têm forma — trata como dinheiro.
    tabReceipts[payment.paymentMethod ?? "CASH"] += Number(payment.amount);
  }

  const preorderReceipts = emptyByMethod();
  for (const preorder of preorders) {
    const deposit = Number(preorder.depositAmount);
    if (preorder.depositPaidAt && preorder.depositPaidAt >= range.from && preorder.depositPaidAt < range.to) {
      preorderReceipts[preorder.depositMethod ?? "CASH"] += deposit;
    }
    if (preorder.deliveredAt && preorder.deliveredAt >= range.from && preorder.deliveredAt < range.to) {
      const balance = Number(preorder.totalAmount) - deposit;
      if (balance > 0 && preorder.balanceMethod) {
        preorderReceipts[preorder.balanceMethod] += balance;
      }
    }
  }

  const movements = session.movements ?? [];
  const supplies = movements.filter((m) => m.type === "SUPPLY").reduce((sum, m) => sum + Number(m.amount), 0);
  const withdrawals = movements
    .filter((m) => m.type === "WITHDRAWAL")
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const receivedByMethod = Object.fromEntries(
    MONEY_METHODS.map((method) => [
      method,
      round(sales[method] + tabReceipts[method] + preorderReceipts[method]),
    ]),
  );

  const expectedCash = round(Number(session.openingAmount) + receivedByMethod.CASH + supplies - withdrawals);

  return {
    openingAmount: Number(session.openingAmount),
    sales: Object.fromEntries(Object.entries(sales).map(([k, v]) => [k, round(v)])),
    salesCount,
    salesTotal: round(Object.values(sales).reduce((a, b) => a + b, 0)),
    ordersCount: orders.length,
    tabReceipts: Object.fromEntries(Object.entries(tabReceipts).map(([k, v]) => [k, round(v)])),
    preorderReceipts: Object.fromEntries(Object.entries(preorderReceipts).map(([k, v]) => [k, round(v)])),
    receivedByMethod,
    supplies: round(supplies),
    withdrawals: round(withdrawals),
    canceledCount: canceled._count,
    canceledTotal: round(Number(canceled._sum.totalAmount ?? 0)),
    expectedCash,
  };
}

async function withSummary(session) {
  if (!session) return null;
  return { ...session, summary: await buildSummary(session) };
}

export async function getCurrent() {
  return withSummary(await cashRepository.findOpen());
}

export async function openSession({ userId, openingAmount }) {
  const amount = parseAmount(openingAmount ?? 0, "Valor de abertura");
  const session = await cashRepository.open({ openedById: userId, openingAmount: amount });
  return withSummary(session);
}

export async function addMovement({ userId, type, amount, reason }) {
  if (!MOVEMENT_TYPES.includes(type)) {
    throw new Error("Tipo de movimento inválido.");
  }
  const value = parseAmount(amount, "Valor");
  if (value <= 0) {
    throw new Error("O valor precisa ser maior que zero.");
  }
  if (!reason?.trim()) {
    throw new Error("Informe o motivo.");
  }

  const session = await cashRepository.findOpen();
  if (!session) {
    throw new Error("Nenhum caixa aberto.");
  }

  if (type === "WITHDRAWAL") {
    const summary = await buildSummary(session);
    if (value > summary.expectedCash + 0.009) {
      throw new Error(
        `Sangria maior que o dinheiro esperado na gaveta (R$ ${summary.expectedCash.toFixed(2)}).`,
      );
    }
  }

  await cashRepository.createMovement({
    sessionId: session.id,
    type,
    amount: value,
    reason: reason.trim(),
    userId,
  });
  return getCurrent();
}

export async function closeSession({ userId, countedCash, notes }) {
  if (countedCash === undefined || countedCash === null || countedCash === "") {
    throw new Error("Informe quanto dinheiro foi contado na gaveta.");
  }
  const counted = parseAmount(countedCash, "Valor contado");

  const session = await cashRepository.findOpen();
  if (!session) {
    throw new Error("Nenhum caixa aberto.");
  }

  const closedAt = new Date();
  const summary = await buildSummary({ ...session, closedAt });
  const closed = await cashRepository.close(session.id, {
    closedById: userId,
    closedAt,
    expectedCash: summary.expectedCash,
    countedCash: counted,
    notes: notes?.trim() || null,
  });
  return { ...closed, summary };
}

export function listSessions() {
  return cashRepository.findRecent();
}

export async function getSession(id) {
  const session = await cashRepository.findById(Number(id));
  if (!session) {
    throw new Error("Caixa não encontrado.");
  }
  return withSummary(session);
}
