import { describe, it, expect, vi, beforeEach } from "vitest";
import * as productService from "../product.service.js";
import * as productRepository from "../../repositories/product.repository.js";

vi.mock("../../repositories/product.repository.js");

const coxinha = { id: 1, name: "Coxinha", active: true, isCombo: false, stockQuantity: 30 };
const kibe = { id: 3, name: "Kibe", active: true, isCombo: false, stockQuantity: 7 };
const otherCombo = { id: 8, name: "Outro combo", active: true, isCombo: true, stockQuantity: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  productRepository.findManyByIds.mockImplementation(async (ids) =>
    [coxinha, kibe, otherCombo].filter((p) => ids.includes(p.id)),
  );
  productRepository.create.mockImplementation(async (data, userId, comboItems) => ({
    id: 20,
    ...data,
    comboItems: [],
  }));
});

describe("product.service.availableQuantity", () => {
  it("combo: o componente mais escasso manda", () => {
    const combo = {
      isCombo: true,
      comboItems: [
        { quantity: 2, component: coxinha }, // 30 / 2 = 15
        { quantity: 2, component: kibe }, // 7 / 2 = 3
      ],
    };
    expect(productService.availableQuantity(combo)).toBe(3);
  });

  it("combo com componente inativo não está disponível", () => {
    expect(
      productService.availableQuantity({
        isCombo: true,
        comboItems: [{ quantity: 1, component: { ...kibe, active: false } }],
      }),
    ).toBe(0);
  });

  it("produto normal: o próprio estoque", () => {
    expect(productService.availableQuantity(coxinha)).toBe(30);
  });
});

describe("product.service.createProduct (combo)", () => {
  const base = { name: "Cento misto", category: "Combos", price: 90, isCombo: true };

  it("cria combo sem estoque próprio e com a composição", async () => {
    await productService.createProduct(
      {
        ...base,
        stockQuantity: 50,
        minStockAlert: 5,
        comboItems: [
          { productId: 1, quantity: 50 },
          { productId: 3, quantity: 50 },
        ],
      },
      2,
    );
    const [data, userId, comboItems] = productRepository.create.mock.calls[0];
    expect(data).toMatchObject({ isCombo: true, stockQuantity: 0, minStockAlert: null });
    expect(userId).toBe(2);
    expect(comboItems).toEqual([
      { productId: 1, quantity: 50 },
      { productId: 3, quantity: 50 },
    ]);
  });

  it("recusa combo vazio, combo dentro de combo e produto repetido", async () => {
    await expect(productService.createProduct({ ...base, comboItems: [] })).rejects.toThrow("ao menos um produto");
    await expect(
      productService.createProduct({ ...base, comboItems: [{ productId: 8, quantity: 1 }] }),
    ).rejects.toThrow("combo não pode ter outro combo");
    await expect(
      productService.createProduct({
        ...base,
        comboItems: [
          { productId: 1, quantity: 1 },
          { productId: 1, quantity: 2 },
        ],
      }),
    ).rejects.toThrow("repetido");
  });

  it("recusa quantidade fracionada", async () => {
    await expect(
      productService.createProduct({ ...base, comboItems: [{ productId: 1, quantity: 0.5 }] }),
    ).rejects.toThrow("inteiro");
  });
});
