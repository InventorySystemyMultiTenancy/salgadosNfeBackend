import { prisma } from "../prismaClient.js";

const sessionInclude = {
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  movements: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  },
};

export function findOpen() {
  return prisma.cashSession.findFirst({
    where: { closedAt: null },
    include: sessionInclude,
    orderBy: { openedAt: "desc" },
  });
}

export function findById(id) {
  return prisma.cashSession.findUnique({ where: { id }, include: sessionInclude });
}

export function findRecent({ openedAt, userId, take = 100 } = {}) {
  const where = {
    ...(openedAt ? { openedAt } : {}),
    ...(userId ? { OR: [{ openedById: userId }, { closedById: userId }] } : {}),
  };
  return prisma.cashSession.findMany({
    where,
    include: {
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
    orderBy: { openedAt: "desc" },
    take,
  });
}

// Abre dentro de uma transação pra dois cliques simultâneos não abrirem dois caixas.
export function open({ openedById, openingAmount }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cashSession.findFirst({ where: { closedAt: null } });
    if (existing) {
      throw new Error("Já existe um caixa aberto.");
    }
    return tx.cashSession.create({
      data: { openedById, openingAmount },
      include: sessionInclude,
    });
  });
}

export function createMovement({ sessionId, type, amount, reason, userId }) {
  return prisma.cashMovement.create({ data: { sessionId, type, amount, reason, userId } });
}

export async function close(id, { closedById, closedAt, expectedCash, countedCash, notes }) {
  const { count } = await prisma.cashSession.updateMany({
    where: { id, closedAt: null },
    data: { closedById, closedAt, expectedCash, countedCash, notes },
  });
  if (count === 0) {
    throw new Error("Este caixa já foi fechado.");
  }
  return findById(id);
}
