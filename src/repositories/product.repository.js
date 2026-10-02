import { prisma } from "../prismaClient.js";
import { logMovement } from "./stock.repository.js";

export function findAll() {
  return prisma.product.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export function findById(id) {
  return prisma.product.findUnique({ where: { id } });
}

// Estoque informado no cadastro também entra no livro de movimentações (estoque inicial / ajuste),
// senão o histórico não fecha com o saldo do produto.
export function create(data, userId = null) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data });
    if (product.stockQuantity !== 0) {
      await logMovement(tx, {
        productId: product.id,
        type: "ENTRY",
        quantity: product.stockQuantity,
        balanceAfter: product.stockQuantity,
        reason: "Estoque inicial no cadastro",
        userId,
      });
    }
    return product;
  });
}

export function update(id, data, userId = null) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.product.findUnique({ where: { id }, select: { stockQuantity: true } });
    const product = await tx.product.update({ where: { id }, data });
    const delta = product.stockQuantity - before.stockQuantity;
    if (delta !== 0) {
      await logMovement(tx, {
        productId: id,
        type: "ADJUSTMENT",
        quantity: delta,
        balanceAfter: product.stockQuantity,
        reason: "Alterado no cadastro do produto",
        userId,
      });
    }
    return product;
  });
}

export function deactivate(id) {
  return prisma.product.update({ where: { id }, data: { active: false } });
}
