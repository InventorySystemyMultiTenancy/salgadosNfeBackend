import { prisma } from "../prismaClient.js";

export function findByClient(clientId) {
  return prisma.clientPayment.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });
}

export function create(clientId, amount, tx = prisma, paymentMethod = null) {
  return tx.clientPayment.create({ data: { clientId, amount, paymentMethod } });
}

export function findInRange({ from, to }) {
  return prisma.clientPayment.findMany({
    where: { createdAt: { gte: from, lt: to } },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
