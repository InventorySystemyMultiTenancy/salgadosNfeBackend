import { describe, it, expect, vi, beforeEach } from "vitest";
import * as clientService from "../client.service.js";
import * as clientRepository from "../../repositories/client.repository.js";
import * as clientPaymentRepository from "../../repositories/clientPayment.repository.js";

vi.mock("../../repositories/client.repository.js");
vi.mock("../../repositories/clientPayment.repository.js");

const { prismaTxMock } = vi.hoisted(() => ({
  prismaTxMock: {
    client: { update: vi.fn() },
    clientPayment: { create: vi.fn() },
  },
}));

vi.mock("../../prismaClient.js", () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(prismaTxMock)),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("client.service.createClient", () => {
  it("exige nome e telefone", () => {
    expect(() => clientService.createClient({ name: "", phone: "" })).toThrow(
      "Nome e telefone/WhatsApp são obrigatórios.",
    );
  });

  it("valida dia de vencimento entre 1 e 31", () => {
    expect(() => clientService.createClient({ name: "Ana", phone: "111", dueDay: 40 })).toThrow(
      "Dia de vencimento deve ser entre 1 e 31.",
    );
  });
});

describe("client.service.settleDebt", () => {
  it("rejeita cliente inexistente", async () => {
    clientRepository.findById.mockResolvedValue(null);
    await expect(clientService.settleDebt(1, 10)).rejects.toThrow("Cliente não encontrado.");
  });

  it("rejeita valor zero ou negativo", async () => {
    clientRepository.findById.mockResolvedValue({ id: 1, currentBalance: 50 });
    await expect(clientService.settleDebt(1, 0)).rejects.toThrow("Valor do pagamento deve ser maior que zero.");
  });

  it("rejeita valor maior que o saldo devedor", async () => {
    clientRepository.findById.mockResolvedValue({ id: 1, currentBalance: 20 });
    await expect(clientService.settleDebt(1, 50)).rejects.toThrow(
      "Valor do pagamento é maior que o saldo devedor.",
    );
  });

  it("registra o pagamento e decrementa o saldo dentro do limite", async () => {
    clientRepository.findById.mockResolvedValue({ id: 1, currentBalance: 50 });
    clientPaymentRepository.create.mockResolvedValue({});
    prismaTxMock.client.update.mockResolvedValue({ id: 1, currentBalance: 30 });

    await clientService.settleDebt(1, 20);

    expect(clientPaymentRepository.create).toHaveBeenCalledWith(1, 20, prismaTxMock);
    expect(prismaTxMock.client.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { currentBalance: { decrement: 20 } },
    });
  });
});
