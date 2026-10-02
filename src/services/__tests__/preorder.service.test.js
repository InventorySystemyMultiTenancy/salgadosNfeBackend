import { describe, it, expect, vi, beforeEach } from "vitest";
import * as preorderService from "../preorder.service.js";
import * as preorderRepository from "../../repositories/preorder.repository.js";
import * as productRepository from "../../repositories/product.repository.js";
import * as clientRepository from "../../repositories/client.repository.js";

vi.mock("../../repositories/preorder.repository.js");
vi.mock("../../repositories/product.repository.js");
vi.mock("../../repositories/client.repository.js");

const base = {
  userId: 1,
  customerName: "Maria",
  deliveryAt: "2026-10-10T15:00:00-03:00",
  items: [{ productId: 1, quantity: 100, unitPrice: 0.9 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  productRepository.findById.mockResolvedValue({ id: 1, name: "Coxinha", price: "7.50" });
  preorderRepository.create.mockImplementation(async (data) => data);
});

describe("preorder.service.createPreorder", () => {
  it("usa o preço negociado e registra o sinal", async () => {
    const result = await preorderService.createPreorder({ ...base, depositAmount: 40, depositMethod: "PIX" });
    expect(result.totalAmount).toBe(90);
    expect(result.depositAmount).toBe(40);
    expect(result.depositMethod).toBe("PIX");
    expect(result.depositPaidAt).toBeInstanceOf(Date);
  });

  it("cai no preço do produto quando o item não traz preço", async () => {
    const result = await preorderService.createPreorder({ ...base, items: [{ productId: 1, quantity: 2 }] });
    expect(result.totalAmount).toBe(15);
    expect(result.depositPaidAt).toBeNull();
  });

  it("recusa sinal maior que o total", async () => {
    await expect(
      preorderService.createPreorder({ ...base, depositAmount: 200, depositMethod: "CASH" }),
    ).rejects.toThrow("sinal");
  });

  it("exige forma de pagamento do sinal", async () => {
    await expect(preorderService.createPreorder({ ...base, depositAmount: 10 })).rejects.toThrow("forma de pagamento");
  });

  it("puxa nome e telefone do cliente cadastrado", async () => {
    clientRepository.findById.mockResolvedValue({ id: 5, name: "Buffet X", phone: "1199", active: true });
    const result = await preorderService.createPreorder({ ...base, customerName: "", clientId: 5 });
    expect(result).toMatchObject({ clientId: 5, customerName: "Buffet X", customerPhone: "1199" });
  });
});

describe("preorder.service.deliverPreorder", () => {
  it("exige forma de pagamento quando há saldo", async () => {
    preorderRepository.findById.mockResolvedValue({ id: 1, status: "READY", totalAmount: "90", depositAmount: "40" });
    await expect(preorderService.deliverPreorder(1, {})).rejects.toThrow("saldo");
  });

  it("entrega sem forma de pagamento quando já está quitada", async () => {
    preorderRepository.findById.mockResolvedValue({ id: 1, status: "READY", totalAmount: "90", depositAmount: "90" });
    await preorderService.deliverPreorder(1, {});
    expect(preorderRepository.updateFields).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: "DELIVERED", balanceMethod: null }),
    );
  });

  it("não entrega encomenda cancelada", async () => {
    preorderRepository.findById.mockResolvedValue({ id: 1, status: "CANCELED" });
    await expect(preorderService.deliverPreorder(1, { balanceMethod: "CASH" })).rejects.toThrow("cancelada");
  });
});
