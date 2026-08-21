import * as orderRepository from "../repositories/order.repository.js";
import * as productRepository from "../repositories/product.repository.js";
import * as clientRepository from "../repositories/client.repository.js";

const ALL_PAYMENT_METHODS = ["CASH", "DEBIT", "CREDIT", "PIX", "TAB"];
const KITCHEN_STATUSES = ["PENDING", "PREPARING", "READY"];

export function listOrders() {
  return orderRepository.findAll();
}

export function getOrder(id) {
  return orderRepository.findById(Number(id));
}

export function getKitchenQueue() {
  return orderRepository.findKitchenQueue();
}

export function setKitchenStatus(id, status) {
  if (!KITCHEN_STATUSES.includes(status)) {
    throw new Error("Status de cozinha inválido.");
  }
  return orderRepository.updateKitchenStatus(Number(id), status);
}

export async function getStockAuditBySeller() {
  const orderItems = await orderRepository.findAllItemsWithSellerAndProduct();

  const grouped = new Map();
  for (const item of orderItems) {
    const seller = item.order.seller;
    const key = `${seller.id}-${item.product.id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalQuantity += item.quantity;
    } else {
      grouped.set(key, {
        sellerId: seller.id,
        sellerName: seller.name,
        productId: item.product.id,
        productName: item.product.name,
        totalQuantity: item.quantity,
      });
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => a.sellerName.localeCompare(b.sellerName) || a.productName.localeCompare(b.productName),
  );
}

export async function createOrder({ sellerId, paymentMethod, clientId, items }) {
  if (!ALL_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error("Forma de pagamento inválida.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("O pedido precisa ter ao menos um item.");
  }

  const resolvedItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const product = await productRepository.findById(Number(item.productId));
    if (!product || !product.active) {
      throw new Error(`Produto ${item.productId} não encontrado.`);
    }
    if (product.stockQuantity < item.quantity) {
      throw new Error(`Estoque insuficiente para ${product.name}.`);
    }

    const unitPrice = Number(product.price);
    totalAmount += unitPrice * item.quantity;

    resolvedItems.push({
      productId: product.id,
      quantity: item.quantity,
      unitPrice,
    });
  }

  let paymentStatus = "PAID";

  if (paymentMethod === "TAB") {
    if (!clientId) {
      throw new Error("Selecione um cliente para venda fiado.");
    }

    const client = await clientRepository.findById(Number(clientId));
    if (!client || !client.active) {
      throw new Error("Cliente não encontrado ou inativo.");
    }

    const projectedBalance = Number(client.currentBalance) + totalAmount;
    if (projectedBalance > Number(client.creditLimit)) {
      throw new Error(`Limite de crédito insuficiente para ${client.name}.`);
    }

    paymentStatus = "PENDING";
  }

  return orderRepository.createWithItems({
    sellerId,
    clientId: paymentMethod === "TAB" ? Number(clientId) : null,
    paymentMethod,
    paymentStatus,
    items: resolvedItems,
    totalAmount,
  });
}
