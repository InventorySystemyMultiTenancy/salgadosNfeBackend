import * as stockRepository from "../repositories/stock.repository.js";
import * as productRepository from "../repositories/product.repository.js";
import { parseId, parseOptionalRange } from "./filters.js";

const ENTRY_TYPES = ["ENTRY", "LOSS"];
const MOVEMENT_TYPES = ["ENTRY", "LOSS", "COUNT", "ADJUSTMENT", "SALE", "SALE_CANCEL"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 370;

function parseQuantity(value, { allowZero }) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 0 || (!allowZero && quantity === 0)) {
    return null;
  }
  return quantity;
}

// Junta linhas repetidas do mesmo produto (ex: duas linhas de "Coxinha" no lançamento).
function mergeByProduct(items, field) {
  const merged = new Map();
  for (const item of items) {
    const productId = Number(item.productId);
    merged.set(productId, (merged.get(productId) ?? 0) + item[field]);
  }
  return Array.from(merged, ([productId, value]) => ({ productId, [field]: value }));
}

async function assertProductsExist(items) {
  for (const item of items) {
    const product = await productRepository.findById(item.productId);
    if (!product || !product.active) {
      throw new Error(`Produto ${item.productId} não encontrado.`);
    }
  }
}

export async function createEntries({ userId, type, reason, items }) {
  if (!ENTRY_TYPES.includes(type)) {
    throw new Error("Tipo de lançamento inválido.");
  }
  if (!reason?.trim()) {
    throw new Error("Informe o motivo do lançamento.");
  }
  if (!Array.isArray(items)) {
    throw new Error("Informe ao menos um produto.");
  }

  const valid = [];
  for (const item of items) {
    const quantity = parseQuantity(item.quantity, { allowZero: true });
    if (quantity === null) {
      throw new Error("Quantidade inválida: use números inteiros.");
    }
    if (quantity > 0) valid.push({ productId: Number(item.productId), quantity });
  }
  if (valid.length === 0) {
    throw new Error("Informe a quantidade de ao menos um produto.");
  }

  const merged = mergeByProduct(valid, "quantity");
  await assertProductsExist(merged);
  return stockRepository.createEntries({ type, reason: reason.trim(), userId, items: merged });
}

export async function applyCount({ userId, notes, items }) {
  if (!Array.isArray(items)) {
    throw new Error("Informe a contagem de ao menos um produto.");
  }

  // Campo em branco = produto não contado nesta conferência (não mexe no estoque dele).
  const counted = [];
  for (const item of items) {
    if (item.counted === "" || item.counted === null || item.counted === undefined) continue;
    const value = parseQuantity(item.counted, { allowZero: true });
    if (value === null) {
      throw new Error("Contagem inválida: use números inteiros a partir de zero.");
    }
    counted.push({ productId: Number(item.productId), counted: value });
  }
  if (counted.length === 0) {
    throw new Error("Informe a contagem de ao menos um produto.");
  }

  const productIds = counted.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw new Error("Produto repetido na conferência.");
  }
  await assertProductsExist(counted);
  return stockRepository.applyCount({ userId, notes: notes?.trim() || null, items: counted });
}

export function listMovements({ productId, type, from, to }) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("Período inválido.");
  }
  if (end - start > MAX_RANGE_DAYS * DAY_MS) {
    throw new Error("Período máximo do histórico é de 1 ano.");
  }
  if (type && !MOVEMENT_TYPES.includes(type)) {
    throw new Error("Tipo de movimentação inválido.");
  }
  return stockRepository.findMovements({
    productId: productId ? Number(productId) : null,
    type: type || null,
    from: start,
    to: end,
  });
}

export async function listCounts({ from, to, userId } = {}) {
  const counts = await stockRepository.findCounts({
    createdAt: parseOptionalRange({ from, to }),
    userId: parseId(userId),
  });
  return counts.map(({ items, ...count }) => ({
    ...count,
    productsCounted: items.length,
    productsWithDifference: items.filter((item) => item.difference !== 0).length,
    netDifference: items.reduce((sum, item) => sum + item.difference, 0),
  }));
}

export async function getCount(id) {
  const count = await stockRepository.findCountById(Number(id));
  if (!count) {
    throw new Error("Conferência não encontrada.");
  }
  return count;
}
