import { prisma } from "../prismaClient.js";

export function get() {
  return prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export function update(data) {
  return prisma.paymentSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
}
