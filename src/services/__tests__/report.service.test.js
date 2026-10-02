import { describe, it, expect, vi, beforeEach } from "vitest";
import * as reportService from "../report.service.js";
import * as orderRepository from "../../repositories/order.repository.js";
import * as preorderRepository from "../../repositories/preorder.repository.js";

vi.mock("../../repositories/order.repository.js");
vi.mock("../../repositories/preorder.repository.js");

const seller = { id: 1, name: "Ana" };
const coxinha = { id: 1, name: "Coxinha", category: "Salgados" };
const refri = { id: 2, name: "Refri", category: "Bebidas" };

beforeEach(() => {
  vi.resetAllMocks();
  orderRepository.findInRange.mockResolvedValue([
    {
      createdAt: new Date("2026-10-02T13:30:00Z"), // 10:30 em Brasília
      totalAmount: "21.00",
      paymentMethod: "CASH",
      seller,
      items: [
        { product: coxinha, quantity: 2, unitPrice: "7.50" },
        { product: refri, quantity: 1, unitPrice: "6.00" },
      ],
    },
    {
      createdAt: new Date("2026-10-03T02:00:00Z"), // 23:00 do dia 02 em Brasília
      totalAmount: "7.50",
      paymentMethod: "PIX",
      seller,
      items: [{ product: coxinha, quantity: 1, unitPrice: "7.50" }],
    },
  ]);
  orderRepository.aggregateCanceledInRange.mockResolvedValue({ _count: 0, _sum: { totalAmount: null } });
  preorderRepository.findByDeliveryRange.mockResolvedValue([{ status: "PENDING", totalAmount: "50" }]);
  preorderRepository.findDeliveredInRange.mockResolvedValue([{ totalAmount: "90" }]);
});

describe("report.service.getSalesSummary", () => {
  it("agrega no fuso da loja", async () => {
    const summary = await reportService.getSalesSummary({
      from: "2026-10-02T03:00:00Z",
      to: "2026-10-03T03:00:00Z",
      tzOffset: 180,
    });

    expect(summary.revenue).toBe(28.5);
    expect(summary.averageTicket).toBe(14.25);
    expect(summary.byHour[10].count).toBe(1);
    expect(summary.byHour[23].count).toBe(1);
    expect(summary.byDay).toEqual([{ date: "2026-10-02", total: 28.5, count: 2 }]);
    expect(summary.topProducts[0]).toMatchObject({ name: "Coxinha", quantity: 3, total: 22.5 });
    expect(summary.preorders.deliveredTotal).toBe(90);
    expect(summary.preorders.scheduledCount).toBe(1);
  });

  it("recusa período invertido", async () => {
    await expect(
      reportService.getSalesSummary({ from: "2026-10-03T00:00:00Z", to: "2026-10-02T00:00:00Z" }),
    ).rejects.toThrow("Período inválido");
  });
});
