import { prisma } from "../prismaClient.js";

export function findAll() {
  return prisma.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}

export function findById(id) {
  return prisma.client.findUnique({ where: { id } });
}

export function create(data) {
  return prisma.client.create({ data });
}

export function update(id, data) {
  return prisma.client.update({ where: { id }, data });
}

export function deactivate(id) {
  return prisma.client.update({ where: { id }, data: { active: false } });
}

export function findDueOrOverdue(dayOfMonth) {
  return prisma.client.findMany({
    where: {
      active: true,
      dueDay: { not: null },
      OR: [
        { dueDay: dayOfMonth },
        { dueDay: { lt: dayOfMonth }, currentBalance: { gt: 0 } },
      ],
    },
    orderBy: { dueDay: "asc" },
  });
}
