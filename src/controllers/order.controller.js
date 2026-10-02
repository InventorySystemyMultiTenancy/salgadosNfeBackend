import * as orderService from "../services/order.service.js";
import * as fiscalService from "../services/fiscal.service.js";
import { getIO } from "../socket.js";

export async function list(req, res) {
  const orders = await orderService.listOrders({ clientId: req.query.clientId });
  return res.json(orders);
}

export async function getOne(req, res) {
  const order = await orderService.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pedido não encontrado." });
  }
  return res.json(order);
}

export async function create(req, res) {
  try {
    const order = await orderService.createOrder({
      sellerId: req.user.id,
      paymentMethod: req.body.paymentMethod,
      clientId: req.body.clientId,
      items: req.body.items,
      terminalPaymentId: req.body.terminalPaymentId,
    });
    getIO().to("kitchen").emit("order:created", order);
    return res.status(201).json(order);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function cancel(req, res) {
  try {
    const order = await orderService.cancelOrder(req.params.id, { userId: req.user.id, reason: req.body.reason });
    // A cozinha trata pedido cancelado como "saiu da fila".
    getIO().to("kitchen").emit("order:updated", order);
    return res.json(order);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function kitchenQueue(req, res) {
  const orders = await orderService.getKitchenQueue();
  return res.json(orders);
}

export async function updateKitchenStatus(req, res) {
  try {
    const order = await orderService.setKitchenStatus(req.params.id, req.body.status);
    getIO().to("kitchen").emit("order:updated", order);
    return res.json(order);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function stockAudit(req, res) {
  const audit = await orderService.getStockAuditBySeller();
  return res.json(audit);
}

export async function emitFiscal(req, res) {
  try {
    const order = await fiscalService.emitForOrder(req.params.id);
    return res.json(order);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

export async function emitFiscalNFe(req, res) {
  try {
    const order = await fiscalService.emitNFeForOrder(req.params.id);
    return res.json(order);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}
