import { describe, it, expect, vi, beforeEach } from "vitest";
import * as cashService from "../cash.service.js";
import * as cashRepository from "../../repositories/cash.repository.js";
import * as orderRepository from "../../repositories/order.repository.js";
import * as clientPaymentRepository from "../../repositories/clientPayment.repository.js";
import * as preorderRepository from "../../repositories/preorder.repository.js";

vi.mock("../../repositories/cash.repository.js");
vi.mock("../../repositories/order.repository.js");
vi.mock("../../repositories/clientPayment.repository.js");
vi.mock("../../repositories/preorder.repository.js");

const openedAt = new Date("2026-10-02T11:00:00Z");
const session = {
  id: 1,
  openedAt,
  closedAt: null,
  openingAmount: "100.00",
  movements: [
    { type: "SUPPLY", amount: "20.00" },
    { type: "WITHDRAWAL", amount: "50.00" },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  orderRepository.findInRange.mockResolvedValue([
    { paymentMethod: "CASH", totalAmount: "30.00" },
    { paymentMethod: "CASH", totalAmount: "12.50" },
    { paymentMethod: "PIX", totalAmount: "8.00" },
    { paymentMethod: "TAB", totalAmount: "15.00" },
  ]);
  clientPaymentRepository.findInRange.mockResolvedValue([
    { paymentMethod: "CASH", amount: "10.00" },
    { paymentMethod: "PIX", amount: "5.00" },
  ]);
  preorderRepository.findPaymentsInRange.mockResolvedValue([
    // sinal pago no turno, entrega também no turno (saldo no débito)
    {
      totalAmount: "100.00",
      depositAmount: "40.00",
      depositMethod: "CASH",
      depositPaidAt: new Date("2026-10-02T12:00:00Z"),
      balanceMethod: "DEBIT",
      deliveredAt: new Date("2026-10-02T13:00:00Z"),
    },
    // sinal pago antes do turno, só a entrega conta
    {
      totalAmount: "60.00",
      depositAmount: "20.00",
      depositMethod: "PIX",
      depositPaidAt: new Date("2026-10-01T12:00:00Z"),
      balanceMethod: "CASH",
      deliveredAt: new Date("2026-10-02T14:00:00Z"),
    },
  ]);
  orderRepository.aggregateCanceledInRange.mockResolvedValue({ _count: 1, _sum: { totalAmount: "9.00" } });
});

describe("cash.service.buildSummary", () => {
  it("soma vendas, fiado recebido, encomendas e movimentos no dinheiro esperado", async () => {
    const summary = await cashService.buildSummary(session, new Date("2026-10-02T20:00:00Z"));

    // 100 abertura + 42.50 vendas + 10 fiado + 40 sinal + 40 saldo encomenda + 20 suprimento - 50 sangria
    expect(summary.expectedCash).toBe(202.5);
    expect(summary.receivedByMethod).toEqual({ CASH: 132.5, DEBIT: 60, CREDIT: 0, PIX: 13 });
    expect(summary.sales.TAB).toBe(15);
    expect(summary.salesTotal).toBe(65.5);
    expect(summary.canceledCount).toBe(1);
  });
});

describe("cash.service.addMovement", () => {
  it("recusa sangria maior que o dinheiro esperado", async () => {
    cashRepository.findOpen.mockResolvedValue(session);
    await expect(
      cashService.addMovement({ userId: 1, type: "WITHDRAWAL", amount: 500, reason: "cofre" }),
    ).rejects.toThrow("Sangria maior");
    expect(cashRepository.createMovement).not.toHaveBeenCalled();
  });

  it("exige caixa aberto", async () => {
    cashRepository.findOpen.mockResolvedValue(null);
    await expect(
      cashService.addMovement({ userId: 1, type: "SUPPLY", amount: 10, reason: "troco" }),
    ).rejects.toThrow("Nenhum caixa aberto");
  });
});

describe("cash.service.closeSession", () => {
  it("grava esperado e contado no fechamento", async () => {
    cashRepository.findOpen.mockResolvedValue(session);
    cashRepository.close.mockResolvedValue({ id: 1 });

    const result = await cashService.closeSession({ userId: 2, countedCash: "200", notes: "" });

    expect(cashRepository.close).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ closedById: 2, expectedCash: 202.5, countedCash: 200, notes: null }),
    );
    expect(result.summary.expectedCash).toBe(202.5);
  });

  it("exige o valor contado", async () => {
    await expect(cashService.closeSession({ userId: 2, countedCash: "" })).rejects.toThrow("contado");
  });
});
