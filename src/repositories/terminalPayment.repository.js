import { prisma } from "../prismaClient.js";

export function create(data) {
  return prisma.terminalPayment.create({ data });
}

export function findById(id) {
  return prisma.terminalPayment.findUnique({ where: { id } });
}

export function findPendingByTerminal(terminalId) {
  return prisma.terminalPayment.findFirst({ where: { terminalId, status: "PENDING" } });
}

export function update(id, data) {
  return prisma.terminalPayment.update({ where: { id }, data });
}
