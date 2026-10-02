import { describe, it, expect, vi } from "vitest";
import { parseOptionalRange, parsePage } from "../filters.js";
import { buildOrderFilter, listOrders } from "../order.service.js";
import * as clientRepository from "../../repositories/client.repository.js";
import * as orderRepository from "../../repositories/order.repository.js";

vi.mock("../../repositories/order.repository.js");
vi.mock("../../repositories/product.repository.js");
vi.mock("../../repositories/client.repository.js");
vi.mock("../../repositories/terminalPayment.repository.js");

describe("filters.parseOptionalRange", () => {
  it("sem datas não filtra", () => {
    expect(parseOptionalRange({})).toBeNull();
  });

  it("aceita só um lado", () => {
    expect(parseOptionalRange({ from: "2026-10-01T03:00:00Z" })).toEqual({ gte: new Date("2026-10-01T03:00:00Z") });
  });

  it("recusa período invertido e data inválida", () => {
    expect(() => parseOptionalRange({ from: "2026-10-05", to: "2026-10-01" })).toThrow("antes da final");
    expect(() => parseOptionalRange({ from: "ontem" })).toThrow("Período inválido");
  });
});

describe("filters.parsePage", () => {
  it("limita o tamanho da página e calcula o deslocamento", () => {
    expect(parsePage({ page: "3", pageSize: "1000" })).toEqual({ page: 3, pageSize: 200, skip: 400, take: 200 });
    expect(parsePage({})).toEqual({ page: 1, pageSize: 50, skip: 0, take: 50 });
  });
});

describe("order.service.buildOrderFilter", () => {
  it("combina período, forma, situação e vendedor", () => {
    const where = buildOrderFilter({
      from: "2026-10-01T03:00:00Z",
      to: "2026-10-02T03:00:00Z",
      paymentMethod: "PIX",
      status: "canceled",
      sellerId: "4",
    });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { createdAt: { gte: new Date("2026-10-01T03:00:00Z"), lt: new Date("2026-10-02T03:00:00Z") } },
        { paymentMethod: "PIX" },
        { canceledAt: { not: null } },
        { sellerId: 4 },
      ]),
    );
  });

  it("busca por número do pedido e por nome/documento do cliente", () => {
    const [{ OR }] = buildOrderFilter({ q: "#123" }, { matchingClientIds: [9] }).AND;
    expect(OR).toContainEqual({ id: 123 });
    expect(OR).toContainEqual({ clientId: { in: [9] } });
    expect(OR).toContainEqual({ client: { cpf: { contains: "123" } } });
  });

  it("texto não vira busca por número", () => {
    const [{ OR }] = buildOrderFilter({ q: "Maria" }, { matchingClientIds: [2, 5] }).AND;
    expect(OR).toEqual([{ clientId: { in: [2, 5] } }]);
  });

  it("sem filtros devolve objeto vazio", () => {
    expect(buildOrderFilter({})).toEqual({});
  });

  it("recusa valores fora da lista", () => {
    expect(() => buildOrderFilter({ paymentMethod: "BITCOIN" })).toThrow();
    expect(() => buildOrderFilter({ status: "x" })).toThrow();
    expect(() => buildOrderFilter({ fiscalStatus: "x" })).toThrow();
  });
});

describe("order.service.listOrders", () => {
  it("acha cliente pelo nome sem acento", async () => {
    clientRepository.findAllNames.mockResolvedValue([
      { id: 1, name: "João da Conceição" },
      { id: 2, name: "Maria" },
    ]);
    orderRepository.findPage.mockResolvedValue({ orders: [], total: 0, totalAmount: 0 });

    await listOrders({ q: "CONCEICAO" });

    const [where] = orderRepository.findPage.mock.calls[0];
    expect(where.AND[0].OR).toContainEqual({ clientId: { in: [1] } });
  });
});
