import { describe, it, expect, vi, beforeEach } from "vitest";
import * as orderService from "../order.service.js";
import * as orderRepository from "../../repositories/order.repository.js";
import * as productRepository from "../../repositories/product.repository.js";
import * as storeSettingsService from "../storeSettings.service.js";

vi.mock("../../repositories/order.repository.js");
vi.mock("../../repositories/product.repository.js");
vi.mock("../../repositories/client.repository.js");
vi.mock("../../repositories/terminalPayment.repository.js");
vi.mock("../storeSettings.service.js");

const coxinha = { id: 1, name: "Coxinha", active: true, price: "7.50", stockQuantity: 30, isCombo: false };
const refri = { id: 2, name: "Refri", active: true, price: "6.00", stockQuantity: 5, isCombo: false };
const combo = {
  id: 9,
  name: "Coxinha + Refri",
  active: true,
  price: "12.00",
  stockQuantity: 0,
  isCombo: true,
  comboItems: [
    { quantity: 2, component: coxinha },
    { quantity: 1, component: refri },
  ],
};
const byId = { 1: coxinha, 2: refri, 9: combo };

beforeEach(() => {
  vi.resetAllMocks();
  productRepository.findById.mockImplementation(async (id) => byId[id] ?? null);
  orderRepository.createWithItems.mockResolvedValue({ id: 1 });
  storeSettingsService.getSettings.mockResolvedValue({ maxDiscountPercent: 10 });
});

describe("combos", () => {
  it("vende o combo pelo preço dele e baixa os componentes", async () => {
    await orderService.createOrder({ sellerId: 1, paymentMethod: "CASH", items: [{ productId: 9, quantity: 2 }] });
    const call = orderRepository.createWithItems.mock.calls[0][0];
    expect(call.items).toEqual([{ productId: 9, quantity: 2, unitPrice: 12 }]);
    expect(call.totalAmount).toBe(24);
    expect(call.stockLines).toEqual([
      { productId: 1, quantity: 4, reason: "Combo: Coxinha + Refri" },
      { productId: 2, quantity: 2, reason: "Combo: Coxinha + Refri" },
    ]);
  });

  it("confere o estoque somando combo e produto avulso", async () => {
    // 4 refri nos combos + 2 avulsos = 6 > 5 em estoque
    await expect(
      orderService.createOrder({
        sellerId: 1,
        paymentMethod: "CASH",
        items: [
          { productId: 9, quantity: 4 },
          { productId: 2, quantity: 2 },
        ],
      }),
    ).rejects.toThrow("Estoque insuficiente para Refri");
  });

  it("recusa combo com componente desativado", async () => {
    byId[9] = { ...combo, comboItems: [{ quantity: 1, component: { ...refri, active: false } }] };
    await expect(
      orderService.createOrder({ sellerId: 1, paymentMethod: "CASH", items: [{ productId: 9, quantity: 1 }] }),
    ).rejects.toThrow("desativado");
    byId[9] = combo;
  });
});

describe("desconto", () => {
  const base = { sellerId: 3, sellerRole: "SELLER", paymentMethod: "CASH", items: [{ productId: 1, quantity: 4 }] }; // R$ 30

  it("dentro do limite: grava subtotal, desconto e total", async () => {
    await orderService.createOrder({ ...base, discount: { amount: 3, reason: " Cliente fiel " } });
    expect(orderRepository.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotalAmount: 30,
        discountAmount: 3,
        totalAmount: 27,
        discountReason: "Cliente fiel",
        discountApprovedById: null,
      }),
    );
  });

  it("exige motivo", async () => {
    await expect(orderService.createOrder({ ...base, discount: { amount: 2, reason: "" } })).rejects.toThrow("motivo");
  });

  it("recusa desconto maior que o subtotal", async () => {
    await expect(orderService.createOrder({ ...base, discount: { amount: 31, reason: "x" } })).rejects.toThrow(
      "Desconto inválido",
    );
  });

  it("vendedor acima do limite sem autorização é recusado", async () => {
    storeSettingsService.verifyDiscountApproval.mockReturnValue(null);
    await expect(orderService.createOrder({ ...base, discount: { amount: 6, reason: "x" } })).rejects.toThrow(
      "autorização de um administrador",
    );
    expect(orderRepository.createWithItems).not.toHaveBeenCalled();
  });

  it("vendedor acima do limite com autorização grava quem aprovou", async () => {
    storeSettingsService.verifyDiscountApproval.mockReturnValue(1);
    await orderService.createOrder({ ...base, discount: { amount: 6, reason: "x" }, approvalToken: "tok" });
    expect(storeSettingsService.verifyDiscountApproval).toHaveBeenCalledWith("tok", 6);
    expect(orderRepository.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({ discountApprovedById: 1, totalAmount: 24 }),
    );
  });

  it("administrador acima do limite autoriza a si mesmo", async () => {
    await orderService.createOrder({
      ...base,
      sellerId: 1,
      sellerRole: "ADMIN",
      discount: { amount: 15, reason: "x" },
    });
    expect(orderRepository.createWithItems).toHaveBeenCalledWith(expect.objectContaining({ discountApprovedById: 1 }));
  });

  it("sem desconto não consulta configuração", async () => {
    await orderService.createOrder(base);
    expect(storeSettingsService.getSettings).not.toHaveBeenCalled();
    expect(orderRepository.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({ discountAmount: 0, subtotalAmount: 30, totalAmount: 30 }),
    );
  });
});
