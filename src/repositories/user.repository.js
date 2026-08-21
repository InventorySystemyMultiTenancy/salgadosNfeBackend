import { prisma } from "../prismaClient.js";

export function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}

export function findById(id) {
  return prisma.user.findUnique({ where: { id } });
}

export function findAll() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { name: "asc" },
  });
}

export function create(data) {
  return prisma.user.create({ data });
}
