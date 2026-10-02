import { describe, it, expect, vi, beforeEach } from "vitest";
import * as stockService from "../stock.service.js";
import * as stockRepository from "../../repositories/stock.repository.js";
import * as productRepository from "../../repositories/product.repository.js";

vi.mock("../../repositories/stock.repository.js");
vi.mock("../../repositories/product.repository.js");

beforeEach(() => {
  vi.resetAllMocks();
  productRepository.findById.mockResolvedValue({ id: 1, name: "Coxinha", active: true });
});

describe("stock.service.createEntries", () => {
  it("exige motivo", async () => {
    await expect(
      stockService.createEntries({ userId: 1, type: "ENTRY", reason: " ", items: [{ productId: 1, quantity: 5 }] }),
    ).rejects.toThrow("motivo");
  });

  it("recusa tipo que não é lançamento manual", async () => {
    await expect(
      stockService.createEntries({ userId: 1, type: "SALE", reason: "x", items: [{ productId: 1, quantity: 5 }] }),
    ).rejects.toThrow("Tipo de lançamento inválido");
  });

  it("recusa quantidade fracionada", async () => {
    await expect(
      stockService.createEntries({ userId: 1, type: "ENTRY", reason: "x", items: [{ productId: 1, quantity: 1.5 }] }),
    ).rejects.toThrow("inteiros");
  });

  it("ignora linhas zeradas e soma produto repetido", async () => {
    await stockService.createEntries({
      userId: 3,
      type: "ENTRY",
      reason: " Produção do dia ",
      items: [
        { productId: 1, quantity: 30 },
        { productId: 2, quantity: 0 },
        { productId: "1", quantity: "20" },
      ],
    });
    expect(stockRepository.createEntries).toHaveBeenCalledWith({
      type: "ENTRY",
      reason: "Produção do dia",
      userId: 3,
      items: [{ productId: 1, quantity: 50 }],
    });
  });

  it("exige ao menos uma quantidade", async () => {
    await expect(
      stockService.createEntries({ userId: 1, type: "LOSS", reason: "x", items: [{ productId: 1, quantity: 0 }] }),
    ).rejects.toThrow("ao menos um produto");
  });
});

describe("stock.service.applyCount", () => {
  it("só conta os produtos preenchidos (zero conta, vazio não)", async () => {
    await stockService.applyCount({
      userId: 2,
      notes: "",
      items: [
        { productId: 1, counted: "12" },
        { productId: 2, counted: "" },
        { productId: 3, counted: 0 },
      ],
    });
    expect(stockRepository.applyCount).toHaveBeenCalledWith({
      userId: 2,
      notes: null,
      items: [
        { productId: 1, counted: 12 },
        { productId: 3, counted: 0 },
      ],
    });
  });

  it("recusa contagem negativa", async () => {
    await expect(stockService.applyCount({ userId: 2, items: [{ productId: 1, counted: -1 }] })).rejects.toThrow(
      "Contagem inválida",
    );
  });

  it("recusa conferência vazia", async () => {
    await expect(stockService.applyCount({ userId: 2, items: [{ productId: 1, counted: "" }] })).rejects.toThrow(
      "ao menos um produto",
    );
  });
});

describe("stock.service.listCounts", () => {
  it("resume as diferenças de cada conferência", async () => {
    stockRepository.findCounts.mockResolvedValue([
      { id: 1, items: [{ difference: 0 }, { difference: -3 }, { difference: 1 }] },
    ]);
    const [count] = await stockService.listCounts();
    expect(count).toEqual({ id: 1, productsCounted: 3, productsWithDifference: 2, netDifference: -2 });
  });
});
