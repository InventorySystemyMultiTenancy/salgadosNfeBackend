import { prisma } from "../prismaClient.js";

const preorderInclude = {
  items: { include: { product: { select: { id: true, name: true, imageUrl: true, category: true } } } },
  client: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
};

const OPEN_STATUSES = ["PENDING", "IN_PRODUCTION", "READY"];

export function findOpen() {
  return prisma.preorder.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: preorderInclude,
    orderBy: { deliveryAt: "asc" },
  });
}

export function findByDeliveryRange({ from, to }) {
  return prisma.preorder.findMany({
    where: { deliveryAt: { gte: from, lt: to } },
    include: preorderInclude,
    orderBy: { deliveryAt: "asc" },
  });
}

export function findDeliveredInRange({ from, to }) {
  return prisma.preorder.findMany({
    where: { status: "DELIVERED", deliveredAt: { gte: from, lt: to } },
    select: { id: true, totalAmount: true },
  });
}

// Fila de produção da cozinha: encomendas abertas que vencem até `until` (inclui as atrasadas).
export function findProductionQueue(until) {
  return prisma.preorder.findMany({
    where: { status: { in: OPEN_STATUSES }, deliveryAt: { lt: until } },
    include: preorderInclude,
    orderBy: { deliveryAt: "asc" },
  });
}

export function findById(id) {
  return prisma.preorder.findUnique({ where: { id }, include: preorderInclude });
}

export function create({ items, ...data }) {
  return prisma.preorder.create({
    data: { ...data, items: { create: items } },
    include: preorderInclude,
  });
}

// Troca os itens inteiros (mais simples que diff item a item numa tela de edição).
export function update(id, { items, ...data }) {
  return prisma.$transaction(async (tx) => {
    await tx.preorderItem.deleteMany({ where: { preorderId: id } });
    return tx.preorder.update({
      where: { id },
      data: { ...data, items: { create: items } },
      include: preorderInclude,
    });
  });
}

export function updateFields(id, data) {
  return prisma.preorder.update({ where: { id }, data, include: preorderInclude });
}

// Sinais pagos e saldos recebidos num intervalo — entram no fechamento de caixa.
export function findPaymentsInRange({ from, to }) {
  return prisma.preorder.findMany({
    where: {
      OR: [
        { depositPaidAt: { gte: from, lt: to } },
        { deliveredAt: { gte: from, lt: to } },
      ],
    },
    select: {
      id: true,
      customerName: true,
      totalAmount: true,
      depositAmount: true,
      depositMethod: true,
      depositPaidAt: true,
      balanceMethod: true,
      deliveredAt: true,
    },
  });
}
