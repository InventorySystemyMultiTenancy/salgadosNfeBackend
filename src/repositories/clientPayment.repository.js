import { prisma } from "../prismaClient.js";

export function findByClient(clientId) {
  return prisma.clientPayment.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
  });
}

export function create(clientId, amount, tx = prisma) {
  return tx.clientPayment.create({ data: { clientId, amount } });
}
