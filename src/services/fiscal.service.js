import * as fiscalSettingsRepository from "../repositories/fiscalSettings.repository.js";
import * as orderRepository from "../repositories/order.repository.js";
import { getGatewayClient } from "../fiscal/gateway.js";

export function getSettings() {
  return fiscalSettingsRepository.get();
}

export function updateSettings(data) {
  return fiscalSettingsRepository.update({
    companyName: data.companyName ?? null,
    cnpj: data.cnpj ?? null,
    icmsRate: data.icmsRate ?? 0,
    gatewayProvider: data.gatewayProvider ?? "NONE",
    gatewayApiKey: data.gatewayApiKey ?? null,
    environment: data.environment ?? "SANDBOX",
    cbsRate: data.cbsRate ?? 0.9,
    ibsUfRate: data.ibsUfRate ?? 0.05,
    ibsMunRate: data.ibsMunRate ?? 0.05,
    ibsCbsSituacaoTributaria: data.ibsCbsSituacaoTributaria || "000",
    ibsCbsClassificacaoTributaria: data.ibsCbsClassificacaoTributaria || "000001",
  });
}

export async function emitForOrder(orderId) {
  const order = await orderRepository.findById(Number(orderId));
  if (!order) {
    throw new Error("Pedido não encontrado.");
  }

  const settings = await fiscalSettingsRepository.get();
  const client = getGatewayClient(settings.gatewayProvider);

  try {
    const result = await client.emitNFCe({ settings, order });
    const authorized = result.status === "autorizado";
    return orderRepository.updateFiscalResult(order.id, {
      fiscalStatus: authorized ? "AUTHORIZED" : "REJECTED",
      fiscalKey: authorized ? result.fiscalKey : null,
      fiscalError: authorized ? null : result.message ?? "Emissão rejeitada pela SEFAZ.",
    });
  } catch (error) {
    await orderRepository.updateFiscalResult(order.id, {
      fiscalStatus: "REJECTED",
      fiscalKey: null,
      fiscalError: error.message,
    });
    throw error;
  }
}
