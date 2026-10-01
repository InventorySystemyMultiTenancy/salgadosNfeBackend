import { prisma } from "../prismaClient.js";

export function findAll({ clientId } = {}) {
  return prisma.order.findMany({
    where: clientId ? { clientId: Number(clientId) } : undefined,
    include: {
      items: { include: { product: { select: { id: true, name: true } } } },
      seller: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, cpf: true, cnpj: true } },
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
    where: { kitchenStatus: { not: "READY" } },
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
    include: {
      product: { select: { id: true, name: true } },
      order: { select: { seller: { select: { id: true, name: true } } } },
    },
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
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { decrement: item.quantity } },
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
