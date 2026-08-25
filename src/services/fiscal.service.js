import * as fiscalSettingsRepository from "../repositories/fiscalSettings.repository.js";
import * as orderRepository from "../repositories/order.repository.js";
import { getGatewayClient } from "../fiscal/gateway.js";

function maskApiKey(key) {
  if (!key) return null;
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}

function withMaskedKey(settings) {
  const { gatewayApiKey, ...rest } = settings;
  return {
    ...rest,
    hasGatewayApiKey: Boolean(gatewayApiKey),
    gatewayApiKeyPreview: maskApiKey(gatewayApiKey),
  };
}

export async function getSettings() {
  const settings = await fiscalSettingsRepository.get();
  return withMaskedKey(settings);
}

// Merge com o registro atual: campos ausentes do payload (undefined) mantêm o valor já salvo em
// vez de serem resetados pro default. Uma requisição parcial não pode apagar o resto da config.
export async function updateSettings(data) {
  const existing = await fiscalSettingsRepository.get();

  const update = {
    companyName: data.companyName !== undefined ? data.companyName : existing.companyName,
    cnpj: data.cnpj !== undefined ? data.cnpj : existing.cnpj,
    icmsRate: data.icmsRate !== undefined ? data.icmsRate : existing.icmsRate,
    gatewayProvider: data.gatewayProvider !== undefined ? data.gatewayProvider : existing.gatewayProvider,
    gatewayCompanyId:
      data.gatewayCompanyId !== undefined ? data.gatewayCompanyId : existing.gatewayCompanyId,
    environment: data.environment !== undefined ? data.environment : existing.environment,
    cbsRate: data.cbsRate !== undefined ? data.cbsRate : existing.cbsRate,
    ibsUfRate: data.ibsUfRate !== undefined ? data.ibsUfRate : existing.ibsUfRate,
    ibsMunRate: data.ibsMunRate !== undefined ? data.ibsMunRate : existing.ibsMunRate,
    ibsCbsSituacaoTributaria: data.ibsCbsSituacaoTributaria || existing.ibsCbsSituacaoTributaria,
    ibsCbsClassificacaoTributaria:
      data.ibsCbsClassificacaoTributaria || existing.ibsCbsClassificacaoTributaria,
    ibsCbsMunicipioCodigo:
      data.ibsCbsMunicipioCodigo !== undefined ? data.ibsCbsMunicipioCodigo : existing.ibsCbsMunicipioCodigo,
  };

  // Só sobrescreve a chave se uma nova de verdade foi digitada — o campo chega vazio quando o
  // usuário deixa em branco pra manter a chave atual (a real nunca volta pra tela).
  if (data.gatewayApiKey) {
    update.gatewayApiKey = data.gatewayApiKey;
  }

  const settings = await fiscalSettingsRepository.update(update);
  return withMaskedKey(settings);
}

export async function emitForOrder(orderId) {
  const order = await orderRepository.findById(Number(orderId));
  if (!order) {
    throw new Error("Pedido não encontrado.");
  }

  const settings = await fiscalSettingsRepository.get();
  const client = getGatewayClient(settings.gatewayProvider);

  try {
    // Cada client normaliza o vocabulário de status do seu provedor pro enum FiscalStatus daqui —
    // ex: a Focus NFe usa "autorizado"/"erro_autorizacao" em português, a NFe.io processa de forma
    // assíncrona e pode devolver PENDING. O service não conhece nada disso, só consome o resultado.
    const result = await client.emitNFCe({ settings, order });
    return orderRepository.updateFiscalResult(order.id, {
      fiscalStatus: result.fiscalStatus,
      fiscalKey: result.fiscalStatus === "AUTHORIZED" ? result.fiscalKey : null,
      fiscalError: result.fiscalStatus === "AUTHORIZED" ? null : result.message ?? "Emissão rejeitada pela SEFAZ.",
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
