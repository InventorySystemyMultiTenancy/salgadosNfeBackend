import * as orderRepository from "../repositories/order.repository.js";
import * as preorderRepository from "../repositories/preorder.repository.js";

const MAX_RANGE_DAYS = 370;
const DAY_MS = 24 * 60 * 60 * 1000;

function round(value) {
  return Math.round(value * 100) / 100;
}

// O servidor roda em UTC; o navegador manda o próprio fuso (minutos de Date#getTimezoneOffset)
// pra "hora do dia" e "dia" baterem com o relógio da loja.
function toLocal(date, tzOffset) {
  return new Date(date.getTime() - tzOffset * 60 * 1000);
}

function localDayKey(date, tzOffset) {
  return toLocal(date, tzOffset).toISOString().slice(0, 10);
}

export async function getSalesSummary({ from, to, tzOffset = 0 }) {
  const start = new Date(from);
  const end = new Date(to);
  const offset = Number(tzOffset) || 0;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error("Período inválido.");
  }
  if (end - start > MAX_RANGE_DAYS * DAY_MS) {
    throw new Error("Período máximo do relatório é de 1 ano.");
  }

  const range = { from: start, to: end };
  // Encomenda entregue conta no dia em que foi entregue (pode ser antes do agendado); as agendadas
  // contam pela data marcada pra entrega.
  const [orders, canceled, scheduledPreorders, deliveredPreorders] = await Promise.all([
    orderRepository.findInRange(range),
    orderRepository.aggregateCanceledInRange(range),
    preorderRepository.findByDeliveryRange(range),
    preorderRepository.findDeliveredInRange(range),
  ]);

  const byMethod = {};
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, count: 0 }));
  const byDayMap = new Map();
  const products = new Map();
  const sellers = new Map();
  let revenue = 0;

  // Pré-preenche todos os dias do período, pra dia sem venda aparecer zerado no gráfico.
  for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
    byDayMap.set(localDayKey(new Date(t), offset), { date: localDayKey(new Date(t), offset), total: 0, count: 0 });
  }

  for (const order of orders) {
    const total = Number(order.totalAmount);
    revenue += total;

    byMethod[order.paymentMethod] ??= { method: order.paymentMethod, total: 0, count: 0 };
    byMethod[order.paymentMethod].total += total;
    byMethod[order.paymentMethod].count += 1;

    const hour = byHour[toLocal(order.createdAt, offset).getUTCHours()];
    hour.total += total;
    hour.count += 1;

    const dayKey = localDayKey(order.createdAt, offset);
    const day = byDayMap.get(dayKey) ?? { date: dayKey, total: 0, count: 0 };
    day.total += total;
    day.count += 1;
    byDayMap.set(dayKey, day);

    const seller = sellers.get(order.seller.id) ?? { sellerId: order.seller.id, name: order.seller.name, total: 0, count: 0 };
    seller.total += total;
    seller.count += 1;
    sellers.set(order.seller.id, seller);

    for (const item of order.items) {
      const product = products.get(item.product.id) ?? {
        productId: item.product.id,
        name: item.product.name,
        category: item.product.category,
        quantity: 0,
        total: 0,
      };
      product.quantity += item.quantity;
      product.total += item.quantity * Number(item.unitPrice);
      products.set(item.product.id, product);
    }
  }

  const roundTotals = (entry) => ({ ...entry, total: round(entry.total) });

  return {
    revenue: round(revenue),
    ordersCount: orders.length,
    averageTicket: orders.length ? round(revenue / orders.length) : 0,
    itemsSold: Array.from(products.values()).reduce((sum, p) => sum + p.quantity, 0),
    canceledCount: canceled._count,
    canceledTotal: round(Number(canceled._sum.totalAmount ?? 0)),
    byMethod: Object.values(byMethod).map(roundTotals).sort((a, b) => b.total - a.total),
    byHour: byHour.map(roundTotals),
    byDay: Array.from(byDayMap.values()).map(roundTotals).sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: Array.from(products.values())
      .map(roundTotals)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10),
    bySeller: Array.from(sellers.values()).map(roundTotals).sort((a, b) => b.total - a.total),
    preorders: {
      deliveredCount: deliveredPreorders.length,
      deliveredTotal: round(deliveredPreorders.reduce((sum, p) => sum + Number(p.totalAmount), 0)),
      scheduledCount: scheduledPreorders.filter((p) => ["PENDING", "IN_PRODUCTION", "READY"].includes(p.status)).length,
    },
  };
}
