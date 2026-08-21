import { prisma } from "../prismaClient.js";

export function findAll() {
  return prisma.product.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export function findById(id) {
  return prisma.product.findUnique({ where: { id } });
}

export function create(data) {
  return prisma.product.create({ data });
}

export function update(id, data) {
  return prisma.product.update({ where: { id }, data });
}

export function deactivate(id) {
  return prisma.product.update({ where: { id }, data: { active: false } });
}
