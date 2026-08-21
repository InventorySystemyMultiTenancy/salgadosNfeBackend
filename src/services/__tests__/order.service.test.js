import { describe, it, expect, vi, beforeEach } from "vitest";
import * as orderService from "../order.service.js";
import * as orderRepository from "../../repositories/order.repository.js";
import * as productRepository from "../../repositories/product.repository.js";
import * as clientRepository from "../../repositories/client.repository.js";

vi.mock("../../repositories/order.repository.js");
vi.mock("../../repositories/product.repository.js");
vi.mock("../../repositories/client.repository.js");

const product = { id: 1, name: "Coxinha", active: true, price: "7.50", stockQuantity: 10 };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("order.service.createOrder", () => {
  it("rejeita forma de pagamento inválida", async () => {
    await expect(
      orderService.createOrder({ sellerId: 1, paymentMethod: "BITCOIN", items: [{ productId: 1, quantity: 1 }] }),
    ).rejects.toThrow("Forma de pagamento inválida.");
  });

  it("rejeita pedido sem itens", async () => {
    await expect(orderService.createOrder({ sellerId: 1, paymentMethod: "CASH", items: [] })).rejects.toThrow(
      "O pedido precisa ter ao menos um item.",
    );
  });

  it("rejeita produto inexistente ou inativo", async () => {
    productRepository.findById.mockResolvedValue(null);
    await expect(
      orderService.createOrder({ sellerId: 1, paymentMethod: "CASH", items: [{ productId: 99, quantity: 1 }] }),
    ).rejects.toThrow("não encontrado");
  });

  it("rejeita estoque insuficiente", async () => {
    productRepository.findById.mockResolvedValue({ ...product, stockQuantity: 1 });
    await expect(
      orderService.createOrder({ sellerId: 1, paymentMethod: "CASH", items: [{ productId: 1, quantity: 5 }] }),
    ).rejects.toThrow("Estoque insuficiente");
  });

  it("cria venda à vista com total e status corretos", async () => {
    productRepository.findById.mockResolvedValue(product);
    orderRepository.createWithItems.mockResolvedValue({ id: 1 });

    await orderService.createOrder({
      sellerId: 1,
      paymentMethod: "CASH",
      items: [{ productId: 1, quantity: 2 }],
    });

    expect(orderRepository.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "PAID", clientId: null, totalAmount: 15 }),
    );
  });

  it("rejeita fiado sem cliente selecionado", async () => {
    productRepository.findById.mockResolvedValue(product);
    await expect(
      orderService.createOrder({ sellerId: 1, paymentMethod: "TAB", items: [{ productId: 1, quantity: 1 }] }),
    ).rejects.toThrow("Selecione um cliente");
  });

  it("rejeita fiado com cliente inativo", async () => {
    productRepository.findById.mockResolvedValue(product);
    clientRepository.findById.mockResolvedValue({ id: 5, active: false });
    await expect(
      orderService.createOrder({
        sellerId: 1,
        paymentMethod: "TAB",
        clientId: 5,
        items: [{ productId: 1, quantity: 1 }],
      }),
    ).rejects.toThrow("Cliente não encontrado ou inativo");
  });

  it("rejeita fiado que estoura o limite de crédito", async () => {
    productRepository.findById.mockResolvedValue(product);
    clientRepository.findById.mockResolvedValue({
      id: 5,
      name: "João",
      active: true,
      currentBalance: 8,
      creditLimit: 10,
    });
    await expect(
      orderService.createOrder({
        sellerId: 1,
        paymentMethod: "TAB",
        clientId: 5,
        items: [{ productId: 1, quantity: 1 }],
      }),
    ).rejects.toThrow("Limite de crédito insuficiente");
  });

  it("cria venda fiado dentro do limite com status PENDING", async () => {
    productRepository.findById.mockResolvedValue(product);
    clientRepository.findById.mockResolvedValue({
      id: 5,
      name: "João",
      active: true,
      currentBalance: 0,
      creditLimit: 100,
    });
    orderRepository.createWithItems.mockResolvedValue({ id: 2 });

    await orderService.createOrder({
      sellerId: 1,
      paymentMethod: "TAB",
      clientId: 5,
      items: [{ productId: 1, quantity: 1 }],
    });

    expect(orderRepository.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: "PENDING", clientId: 5 }),
    );
  });
});
