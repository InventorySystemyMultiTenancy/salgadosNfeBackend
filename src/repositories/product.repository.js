import { prisma } from "../prismaClient.js";
import { logMovement } from "./stock.repository.js";

// Componentes do combo vêm junto: o PDV calcula quantos combos dá pra montar e a cozinha mostra o
// que vai dentro.
export const comboInclude = {
  comboItems: {
    include: {
      component: { select: { id: true, name: true, category: true, stockQuantity: true, active: true } },
    },
    orderBy: { id: "asc" },
  },
};

export function findAll() {
  return prisma.product.findMany({
    where: { active: true },
    include: comboInclude,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export function findById(id) {
  return prisma.product.findUnique({ where: { id }, include: comboInclude });
}

export function findManyByIds(ids) {
  return prisma.product.findMany({ where: { id: { in: ids } }, include: comboInclude });
}

// Estoque informado no cadastro também entra no livro de movimentações (estoque inicial / ajuste),
// senão o histórico não fecha com o saldo do produto.
export function create(data, userId = null, comboItems = []) {
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
    if (comboItems.length) {
      await tx.comboItem.createMany({
        data: comboItems.map((item) => ({ comboId: product.id, componentId: item.productId, quantity: item.quantity })),
      });
    }
    return tx.product.findUnique({ where: { id: product.id }, include: comboInclude });
  });
}

// comboItems: undefined = não mexe na composição; array = substitui a composição inteira.
export function update(id, data, userId = null, comboItems = undefined) {
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
    if (comboItems !== undefined) {
      await tx.comboItem.deleteMany({ where: { comboId: id } });
      if (comboItems.length) {
        await tx.comboItem.createMany({
          data: comboItems.map((item) => ({ comboId: id, componentId: item.productId, quantity: item.quantity })),
        });
      }
    }
    return tx.product.findUnique({ where: { id }, include: comboInclude });
  });
}

export function deactivate(id) {
  return prisma.product.update({ where: { id }, data: { active: false } });
}
