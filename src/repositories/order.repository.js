import { prisma } from "../prismaClient.js";
import { applyDelta } from "./stock.repository.js";

export function findAll({ clientId } = {}) {
  return prisma.order.findMany({
    where: clientId ? { clientId: Number(clientId) } : undefined,
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
      seller: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, cpf: true, cnpj: true } },
      canceledBy: { select: { id: true, name: true } },
      terminalPayment: { select: { id: true, provider: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function findById(id) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      seller: { select: { id: true, name: true } },
      client: true,
    },
  });
}

export function findKitchenQueue() {
  return prisma.order.findMany({
    where: { kitchenStatus: { not: "READY" }, canceledAt: null },
    include: { items: { include: { product: true } }, seller: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function updateKitchenStatus(id, kitchenStatus) {
  return prisma.order.update({
    where: { id },
    data: { kitchenStatus },
    include: { items: { include: { product: true } }, seller: { select: { id: true, name: true } } },
  });
}

export function updateFiscalResult(
  id,
  { fiscalStatus, fiscalType, fiscalKey, fiscalError, fiscalDanfeUrl, fiscalXmlUrl },
) {
  return prisma.order.update({
    where: { id },
    data: { fiscalStatus, fiscalType, fiscalKey, fiscalError, fiscalDanfeUrl, fiscalXmlUrl },
  });
}

export function findAllItemsWithSellerAndProduct() {
  return prisma.orderItem.findMany({
    where: { order: { canceledAt: null } },
    include: {
      product: { select: { id: true, name: true } },
      order: { select: { seller: { select: { id: true, name: true } } } },
    },
  });
}

// Pedidos válidos (não cancelados) num intervalo — base dos relatórios e do fechamento de caixa.
export function findInRange({ from, to }) {
  return prisma.order.findMany({
    where: { createdAt: { gte: from, lt: to }, canceledAt: null },
    include: {
      items: { include: { product: { select: { id: true, name: true, category: true } } } },
      seller: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function aggregateCanceledInRange({ from, to }) {
  return prisma.order.aggregate({
    where: { createdAt: { gte: from, lt: to }, canceledAt: { not: null } },
    _count: true,
    _sum: { totalAmount: true },
  });
}

// Desfaz a venda numa transação só: marca como cancelada, devolve o estoque e, se foi fiado, tira o
// valor do saldo devedor do cliente. O updateMany com canceledAt: null impede cancelar duas vezes
// se dois cliques chegarem juntos.
export function cancel(id, { canceledById, cancelReason }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, canceledAt: null },
      data: { canceledAt: new Date(), canceledById, cancelReason },
    });
    if (count === 0) {
      throw new Error("Este pedido já foi cancelado.");
    }

    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });

    for (const item of order.items) {
      await applyDelta(tx, {
        productId: item.productId,
        delta: item.quantity,
        type: "SALE_CANCEL",
        reason: cancelReason,
        userId: canceledById,
        orderId: id,
      });
    }

    if (order.clientId && order.paymentMethod === "TAB") {
      await tx.client.update({
        where: { id: order.clientId },
        data: { currentBalance: { decrement: order.totalAmount } },
      });
    }

    return tx.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        seller: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, cpf: true, cnpj: true } },
        canceledBy: { select: { id: true, name: true } },
        terminalPayment: { select: { id: true, provider: true } },
      },
    });
  });
}

export function createWithItems({ sellerId, clientId, paymentMethod, paymentStatus, items, totalAmount, terminalPaymentId }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        sellerId,
        clientId: clientId ?? null,
        paymentMethod,
        paymentStatus,
        totalAmount,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        items: { include: { product: true } },
        seller: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, cpf: true, cnpj: true } },
      },
    });

    // Vincula a cobrança da maquininha dentro da mesma transação: se outra venda já pegou essa
    // cobrança no meio tempo, o updateMany não acha nada e a venda inteira é desfeita.
    if (terminalPaymentId) {
      const { count } = await tx.terminalPayment.updateMany({
        where: { id: terminalPaymentId, orderId: null, status: "APPROVED" },
        data: { orderId: order.id },
      });
      if (count === 0) {
        throw new Error("Esta cobrança da maquininha já foi usada em outra venda.");
      }
    }

    for (const item of items) {
      await applyDelta(tx, {
        productId: item.productId,
        delta: -item.quantity,
        type: "SALE",
        userId: sellerId,
        orderId: order.id,
      });
    }

    if (clientId && paymentMethod === "TAB") {
      await tx.client.update({
        where: { id: clientId },
        data: { currentBalance: { increment: totalAmount } },
      });
    }

    return order;
  });
}
