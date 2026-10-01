import { describe, it, expect, vi, beforeEach } from "vitest";
import * as paymentService from "../payment.service.js";
import * as paymentSettingsRepository from "../../repositories/paymentSettings.repository.js";
import * as terminalPaymentRepository from "../../repositories/terminalPayment.repository.js";
import { getPaymentClient } from "../../payments/gateway.js";

vi.mock("../../repositories/paymentSettings.repository.js");
vi.mock("../../repositories/terminalPayment.repository.js");
vi.mock("../../payments/gateway.js");

const ready = { id: 1, provider: "MERCADO_PAGO", apiKey: "APP_USR-123456", terminalId: "T1", accountId: null };

let client;

beforeEach(() => {
  vi.resetAllMocks();
  client = {
    supportedMethods: ["DEBIT", "CREDIT", "PIX"],
    createCharge: vi.fn(),
    getCharge: vi.fn(),
    cancelCharge: vi.fn(),
  };
  getPaymentClient.mockReturnValue(client);
  // Igual ao Prisma: update devolve o registro inteiro já atualizado.
  terminalPaymentRepository.update.mockImplementation(async (id, data) => {
    const current = await terminalPaymentRepository.findById(id);
    const pending = await terminalPaymentRepository.findPendingByTerminal();
    return { ...(current?.id === id ? current : pending), id, ...data };
  });
});

describe("payment.service settings", () => {
  it("nunca retorna o token real, só um indicador e os últimos 4 caracteres", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    const settings = await paymentService.getSettings();
    expect(settings.apiKey).toBeUndefined();
    expect(settings).toMatchObject({ hasApiKey: true, apiKeyPreview: "••••3456" });
  });

  it("PDV só vê a maquininha habilitada com banco, token e maquininha", async () => {
    paymentSettingsRepository.get.mockResolvedValue({ ...ready, terminalId: null });
    expect(await paymentService.getPublicSettings()).toEqual({ provider: "MERCADO_PAGO", enabled: false, methods: [] });
  });

  it("informa ao PDV as formas que a maquininha aceita", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    expect(await paymentService.getPublicSettings()).toEqual({
      provider: "MERCADO_PAGO",
      enabled: true,
      methods: ["DEBIT", "CREDIT", "PIX"],
    });
  });

  it("SumUp sem merchant code não fica habilitada no PDV", async () => {
    paymentSettingsRepository.get.mockResolvedValue({ ...ready, provider: "SUMUP", accountId: null });
    expect((await paymentService.getPublicSettings()).enabled).toBe(false);
  });

  it("mantém o token atual quando o campo chega vazio", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    paymentSettingsRepository.update.mockImplementation(async (data) => ({ ...ready, ...data }));

    await paymentService.updateSettings({ provider: "MERCADO_PAGO", apiKey: "", terminalId: "T2" });

    expect(paymentSettingsRepository.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ apiKey: expect.anything() }),
    );
    expect(paymentSettingsRepository.update).toHaveBeenCalledWith(expect.objectContaining({ terminalId: "T2" }));
  });

  it("trocar de banco limpa token e maquininha do banco anterior", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    paymentSettingsRepository.update.mockImplementation(async (data) => ({ ...ready, ...data }));

    await paymentService.updateSettings({ provider: "SUMUP" });

    expect(paymentSettingsRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "SUMUP", apiKey: null, terminalId: null, accountId: null }),
    );
  });

  it("rejeita banco desconhecido", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    await expect(paymentService.updateSettings({ provider: "BANCO_X" })).rejects.toThrow("Banco inválido");
  });
});

describe("payment.service.createCharge", () => {
  it("exige a maquininha configurada", async () => {
    paymentSettingsRepository.get.mockResolvedValue({ ...ready, apiKey: null });
    await expect(paymentService.createCharge({ amount: 10, paymentMethod: "DEBIT", sellerId: 1 })).rejects.toThrow(
      "Maquininha não configurada",
    );
  });

  it("rejeita forma de pagamento que a maquininha não aceita", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    client.supportedMethods = ["DEBIT", "CREDIT"];
    await expect(paymentService.createCharge({ amount: 10, paymentMethod: "PIX", sellerId: 1 })).rejects.toThrow(
      "não pode ser cobrada na maquininha",
    );
  });

  it("rejeita valor inválido", async () => {
    await expect(paymentService.createCharge({ amount: 0, paymentMethod: "DEBIT", sellerId: 1 })).rejects.toThrow("Valor inválido");
  });

  it("envia pra maquininha e grava a cobrança", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    terminalPaymentRepository.findPendingByTerminal.mockResolvedValue(null);
    client.createCharge.mockResolvedValue({ providerId: "ORD01", status: "PENDING", providerStatus: "created" });
    terminalPaymentRepository.create.mockImplementation(async (data) => ({ id: 1, ...data }));

    const payment = await paymentService.createCharge({ amount: "15.5", paymentMethod: "CREDIT", sellerId: 3 });

    expect(client.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ settings: ready, amount: 15.5, paymentMethod: "CREDIT" }),
    );
    expect(payment).toMatchObject({
      provider: "MERCADO_PAGO",
      providerId: "ORD01",
      terminalId: "T1",
      amount: 15.5,
      status: "PENDING",
      sellerId: 3,
    });
  });

  it("cancela a cobrança anterior pendurada na mesma maquininha antes de mandar outra", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    terminalPaymentRepository.findPendingByTerminal.mockResolvedValue({
      id: 9,
      provider: "MERCADO_PAGO",
      providerId: "ORD_OLD",
      status: "PENDING",
    });
    client.getCharge.mockResolvedValue({ status: "PENDING", providerStatus: "created" });
    client.cancelCharge.mockResolvedValue({ status: "CANCELED", providerStatus: "canceled" });
    client.createCharge.mockResolvedValue({ providerId: "ORD02", status: "PENDING" });
    terminalPaymentRepository.create.mockImplementation(async (data) => ({ id: 10, ...data }));

    await paymentService.createCharge({ amount: 10, paymentMethod: "DEBIT", sellerId: 1 });

    expect(client.cancelCharge).toHaveBeenCalledWith(expect.objectContaining({ providerId: "ORD_OLD" }));
    expect(client.createCharge).toHaveBeenCalled();
  });

  it("não manda outra cobrança se a anterior já está no aparelho e não dá pra cancelar", async () => {
    paymentSettingsRepository.get.mockResolvedValue(ready);
    terminalPaymentRepository.findPendingByTerminal.mockResolvedValue({
      id: 9,
      provider: "MERCADO_PAGO",
      providerId: "ORD_OLD",
      status: "PENDING",
    });
    client.getCharge.mockResolvedValue({ status: "PENDING", providerStatus: "at_terminal" });
    client.cancelCharge.mockRejectedValue(new Error("409"));

    await expect(paymentService.createCharge({ amount: 10, paymentMethod: "DEBIT", sellerId: 1 })).rejects.toThrow(
      "Já existe uma cobrança aguardando",
    );
    expect(client.createCharge).not.toHaveBeenCalled();
  });
});

describe("payment.service getCharge / cancelCharge", () => {
  const pending = { id: 1, provider: "MERCADO_PAGO", providerId: "ORD01", status: "PENDING" };

  it("consulta o banco enquanto está pendente", async () => {
    terminalPaymentRepository.findById.mockResolvedValue(pending);
    paymentSettingsRepository.get.mockResolvedValue(ready);
    client.getCharge.mockResolvedValue({ status: "APPROVED", providerStatus: "processed", paymentType: "credit_card" });

    const payment = await paymentService.getCharge(1);

    expect(payment).toMatchObject({ status: "APPROVED", paymentType: "credit_card" });
  });

  it("não consulta o banco de novo quando já está finalizada", async () => {
    terminalPaymentRepository.findById.mockResolvedValue({ ...pending, status: "APPROVED" });

    await paymentService.getCharge(1);

    expect(client.getCharge).not.toHaveBeenCalled();
  });

  it("não cancela se foi aprovada no aparelho enquanto o operador clicava em cancelar", async () => {
    terminalPaymentRepository.findById.mockResolvedValue(pending);
    paymentSettingsRepository.get.mockResolvedValue(ready);
    client.getCharge.mockResolvedValue({ status: "APPROVED", providerStatus: "processed" });

    const payment = await paymentService.cancelCharge(1);

    expect(payment.status).toBe("APPROVED");
    expect(client.cancelCharge).not.toHaveBeenCalled();
  });

  it("cancela quando ainda está pendente", async () => {
    terminalPaymentRepository.findById.mockResolvedValue(pending);
    paymentSettingsRepository.get.mockResolvedValue(ready);
    client.getCharge.mockResolvedValue({ status: "PENDING", providerStatus: "created" });
    client.cancelCharge.mockResolvedValue({ status: "CANCELED", providerStatus: "canceled" });

    const payment = await paymentService.cancelCharge(1);

    expect(payment.status).toBe("CANCELED");
  });
});
