import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fiscalService from "../fiscal.service.js";
import * as fiscalSettingsRepository from "../../repositories/fiscalSettings.repository.js";
import * as orderRepository from "../../repositories/order.repository.js";
import { getGatewayClient } from "../../fiscal/gateway.js";

vi.mock("../../repositories/fiscalSettings.repository.js");
vi.mock("../../repositories/order.repository.js");
vi.mock("../../fiscal/gateway.js");

const order = { id: 1, items: [] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fiscal.service.emitForOrder", () => {
  it("rejeita pedido inexistente", async () => {
    orderRepository.findById.mockResolvedValue(null);
    await expect(fiscalService.emitForOrder(1)).rejects.toThrow("Pedido não encontrado.");
  });

  it("propaga erro de gateway não configurado sem alterar o pedido", async () => {
    orderRepository.findById.mockResolvedValue(order);
    fiscalSettingsRepository.get.mockResolvedValue({ gatewayProvider: "NONE" });
    getGatewayClient.mockImplementation(() => {
      throw new Error("Gateway fiscal não configurado. Configure um provedor em Fiscal > Configurações.");
    });

    await expect(fiscalService.emitForOrder(1)).rejects.toThrow("Gateway fiscal não configurado");
    expect(orderRepository.updateFiscalResult).not.toHaveBeenCalled();
  });

  it("marca AUTHORIZED quando o gateway autoriza a emissão", async () => {
    orderRepository.findById.mockResolvedValue(order);
    fiscalSettingsRepository.get.mockResolvedValue({ gatewayProvider: "FOCUS_NFE" });
    const emitNFCe = vi.fn().mockResolvedValue({ status: "autorizado", fiscalKey: "abc123" });
    getGatewayClient.mockReturnValue({ emitNFCe });

    await fiscalService.emitForOrder(1);

    expect(orderRepository.updateFiscalResult).toHaveBeenCalledWith(1, {
      fiscalStatus: "AUTHORIZED",
      fiscalKey: "abc123",
      fiscalError: null,
    });
  });

  it("marca REJECTED com a mensagem da SEFAZ quando a nota é recusada sem exceção", async () => {
    orderRepository.findById.mockResolvedValue(order);
    fiscalSettingsRepository.get.mockResolvedValue({ gatewayProvider: "FOCUS_NFE" });
    const emitNFCe = vi.fn().mockResolvedValue({
      status: "erro_autorizacao",
      fiscalKey: null,
      message: "Rejeição: CNPJ do emitente não habilitado para NFC-e",
    });
    getGatewayClient.mockReturnValue({ emitNFCe });

    await fiscalService.emitForOrder(1);

    expect(orderRepository.updateFiscalResult).toHaveBeenCalledWith(1, {
      fiscalStatus: "REJECTED",
      fiscalKey: null,
      fiscalError: "Rejeição: CNPJ do emitente não habilitado para NFC-e",
    });
  });

  it("marca REJECTED e propaga o erro quando o gateway falha", async () => {
    orderRepository.findById.mockResolvedValue(order);
    fiscalSettingsRepository.get.mockResolvedValue({ gatewayProvider: "FOCUS_NFE" });
    const emitNFCe = vi.fn().mockRejectedValue(new Error("Falha de conexão com a Focus NFe"));
    getGatewayClient.mockReturnValue({ emitNFCe });

    await expect(fiscalService.emitForOrder(1)).rejects.toThrow("Falha de conexão");

    expect(orderRepository.updateFiscalResult).toHaveBeenCalledWith(1, {
      fiscalStatus: "REJECTED",
      fiscalKey: null,
      fiscalError: "Falha de conexão com a Focus NFe",
    });
  });
});
