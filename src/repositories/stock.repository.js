import { prisma } from "../prismaClient.js";

// Grava a linha do livro de movimentações. Sempre chamado dentro da mesma transação que mudou o
// estoque, com o saldo que o UPDATE devolveu — assim o saldo registrado nunca diverge do real.
export function logMovement(
  tx,
  { productId, type, quantity, balanceAfter, reason = null, userId = null, orderId = null, stockCountId = null },
) {
  return tx.stockMovement.create({
    data: { productId, type, quantity, balanceAfter, reason, userId, orderId, stockCountId },
  });
}

// Altera o estoque em `delta` e registra a movimentação. Usado por venda, cancelamento e lançamentos.
export async function applyDelta(tx, { productId, delta, type, reason, userId, orderId, stockCountId }) {
  const product = await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: { increment: delta } },
  });
  await logMovement(tx, {
    productId,
    type,
    quantity: delta,
    balanceAfter: product.stockQuantity,
    reason,
    userId,
    orderId,
    stockCountId,
  });
  return product;
}

// Lançamento de vários produtos de uma vez (ex: produção do dia inteira). Saída que deixaria o
// estoque negativo desfaz o lançamento todo.
export function createEntries({ type, reason, userId, items }) {
  return prisma.$transaction(async (tx) => {
    const results = [];
    for (const item of items) {
      const delta = type === "LOSS" ? -item.quantity : item.quantity;
      const product = await applyDelta(tx, { productId: item.productId, delta, type, reason, userId });
      if (product.stockQuantity < 0) {
        throw new Error(`Saída maior que o estoque de ${product.name} (tinha ${product.stockQuantity - delta}).`);
      }
      results.push(product);
    }
    return results;
  });
}

// Conferência: o estoque passa a ser o contado. O "esperado" é lido dentro da transação, no
// momento do envio — se alguém vendeu enquanto a contagem era feita, a diferença sai certa.
export function applyCount({ userId, notes, items }) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.create({ data: { userId, notes } });

    for (const item of items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product) {
        throw new Error(`Produto ${item.productId} não encontrado.`);
      }
      const difference = item.counted - product.stockQuantity;

      await tx.stockCountItem.create({
        data: {
          stockCountId: count.id,
          productId: product.id,
          expected: product.stockQuantity,
          counted: item.counted,
          difference,
        },
      });

      if (difference !== 0) {
        await applyDelta(tx, {
          productId: product.id,
          delta: difference,
          type: "COUNT",
          reason: "Conferência de estoque",
          userId,
          stockCountId: count.id,
        });
      }
    }

    return tx.stockCount.findUnique({ where: { id: count.id }, include: countInclude });
  });
}

const countInclude = {
  user: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { id: true, name: true, category: true } } },
    orderBy: { difference: "asc" },
  },
};

export function findMovements({ productId, type, from, to, take = 300 }) {
  return prisma.stockMovement.findMany({
    where: {
      productId: productId ?? undefined,
      type: type ?? undefined,
      createdAt: { gte: from, lt: to },
    },
    include: {
      product: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { id: "desc" },
    take,
  });
}

export function findCounts({ createdAt, userId, take = 100 } = {}) {
  return prisma.stockCount.findMany({
    where: { ...(createdAt ? { createdAt } : {}), ...(userId ? { userId } : {}) },
    include: {
      user: { select: { id: true, name: true } },
      items: { select: { difference: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function findCountById(id) {
  return prisma.stockCount.findUnique({ where: { id }, include: countInclude });
}
