import crypto from "node:crypto";
import * as paymentSettingsRepository from "../repositories/paymentSettings.repository.js";
import * as terminalPaymentRepository from "../repositories/terminalPayment.repository.js";
import { getPaymentClient } from "../payments/gateway.js";

const PROVIDERS = ["NONE", "MERCADO_PAGO", "SUMUP"];
const FINAL_STATUSES = ["APPROVED", "CANCELED", "FAILED", "REFUNDED"];

function maskApiKey(key) {
  if (!key) return null;
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}

function withMaskedKey(settings) {
  const { apiKey, ...rest } = settings;
  return {
    ...rest,
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskApiKey(apiKey),
  };
}

function isReady(settings) {
  if (settings.provider === "NONE" || !settings.apiKey || !settings.terminalId) return false;
  // SumUp identifica a conta pelo merchant code em todas as rotas.
  return settings.provider !== "SUMUP" || Boolean(settings.accountId);
}

async function getReadySettings() {
  const settings = await paymentSettingsRepository.get();
  if (!isReady(settings)) {
    throw new Error("Maquininha não configurada. Configure o banco, o token e a maquininha em Config. Pagamento.");
  }
  return settings;
}

export async function getSettings() {
  return withMaskedKey(await paymentSettingsRepository.get());
}

// Pro PDV saber se oferece "cobrar na maquininha" e pra quais formas de pagamento — sem token,
// qualquer perfil autenticado.
export async function getPublicSettings() {
  const settings = await paymentSettingsRepository.get();
  const enabled = isReady(settings);
  return {
    provider: settings.provider,
    enabled,
    methods: enabled ? getPaymentClient(settings.provider).supportedMethods : [],
  };
}

// Merge com o registro atual (mesma regra do fiscal.service): campo ausente mantém o valor salvo,
// e a chave só é trocada quando uma nova é digitada.
export async function updateSettings(data) {
  const existing = await paymentSettingsRepository.get();

  if (data.provider !== undefined && !PROVIDERS.includes(data.provider)) {
    throw new Error("Banco inválido.");
  }

  const providerChanged = data.provider !== undefined && data.provider !== existing.provider;
  const update = {
    provider: data.provider !== undefined ? data.provider : existing.provider,
    accountId:
      data.accountId !== undefined ? data.accountId?.trim() || null : providerChanged ? null : existing.accountId,
    // Trocar de banco invalida a maquininha escolhida (o id é de outra conta/API).
    terminalId:
      data.terminalId !== undefined ? data.terminalId || null : providerChanged ? null : existing.terminalId,
  };

  if (data.apiKey) {
    update.apiKey = data.apiKey.trim();
  } else if (providerChanged) {
    update.apiKey = null;
  }

  return withMaskedKey(await paymentSettingsRepository.update(update));
}

export async function listTerminals() {
  const settings = await paymentSettingsRepository.get();
  if (!settings.apiKey) {
    throw new Error("Salve o token do banco antes de buscar as maquininhas.");
  }
  return getPaymentClient(settings.provider).listTerminals({ settings });
}

// Pareamento por código mostrado no aparelho (SumUp Solo: Conexões > API > Conectar).
export async function pairTerminal({ pairingCode, name }) {
  if (!pairingCode?.trim()) {
    throw new Error("Informe o código de pareamento mostrado na maquininha.");
  }
  const settings = await paymentSettingsRepository.get();
  const client = getPaymentClient(settings.provider);
  if (!client.pairTerminal) {
    throw new Error("Este banco não usa código de pareamento.");
  }
  return client.pairTerminal({ settings, pairingCode, name: name?.trim() || "Caixa" });
}

export async function setupTerminal(terminalId) {
  const settings = await paymentSettingsRepository.get();
  const client = getPaymentClient(settings.provider);
  if (!client.setupTerminal) {
    throw new Error("Este banco não precisa configurar a maquininha.");
  }
  await client.setupTerminal({ settings, terminalId });
}

async function refresh(payment, settings) {
  if (FINAL_STATUSES.includes(payment.status)) return payment;
  const result = await getPaymentClient(payment.provider).getCharge({
    settings,
    providerId: payment.providerId,
    terminalId: payment.terminalId,
  });
  return applyResult(payment, result);
}

function applyResult(payment, result) {
  return terminalPaymentRepository.update(payment.id, {
    status: result.status,
    providerStatus: result.providerStatus,
    statusDetail: result.statusDetail,
    paymentType: result.paymentType ?? payment.paymentType,
  });
}

export async function createCharge({ amount, paymentMethod, sellerId }) {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Valor inválido.");
  }

  const settings = await getReadySettings();
  const client = getPaymentClient(settings.provider);
  if (!client.supportedMethods.includes(paymentMethod)) {
    throw new Error("Esta forma de pagamento não pode ser cobrada na maquininha configurada.");
  }

  // Cobrança anterior que ficou pendurada na mesma maquininha (ex: aba do PDV fechada no meio):
  // tenta cancelar antes de mandar outra, pra não ter duas cobranças disputando o aparelho.
  const pending = await terminalPaymentRepository.findPendingByTerminal(settings.terminalId);
  if (pending) {
    const current = await refresh(pending, settings);
    if (current.status === "PENDING") {
      try {
        const result = await client.cancelCharge({
          settings,
          providerId: current.providerId,
          terminalId: current.terminalId,
        });
        // SumUp cancela de forma assíncrona: se ainda não finalizou, a maquininha continua ocupada.
        if ((await applyResult(current, result)).status === "PENDING") throw new Error("pendente");
      } catch {
        throw new Error("Já existe uma cobrança aguardando na maquininha. Conclua ou cancele no aparelho.");
      }
    }
  }

  const reference = crypto.randomUUID();
  const result = await client.createCharge({
    settings,
    amount: value,
    paymentMethod,
    reference,
    description: `Sabor da Hora ${reference.slice(0, 8).toUpperCase()}`,
  });

  return terminalPaymentRepository.create({
    provider: settings.provider,
    providerId: result.providerId,
    terminalId: settings.terminalId,
    amount: value,
    status: result.status,
    providerStatus: result.providerStatus,
    statusDetail: result.statusDetail,
    paymentType: result.paymentType,
    sellerId,
  });
}

async function findOrFail(id) {
  const payment = await terminalPaymentRepository.findById(Number(id));
  if (!payment) throw new Error("Cobrança não encontrada.");
  return payment;
}

export async function getCharge(id) {
  const payment = await findOrFail(id);
  if (FINAL_STATUSES.includes(payment.status)) return payment;
  return refresh(payment, await paymentSettingsRepository.get());
}

export async function cancelCharge(id) {
  const settings = await paymentSettingsRepository.get();
  // Pode ter sido paga/cancelada no aparelho entre um polling e outro.
  const current = await refresh(await findOrFail(id), settings);
  if (FINAL_STATUSES.includes(current.status)) return current;

  const result = await getPaymentClient(current.provider).cancelCharge({
    settings,
    providerId: current.providerId,
    terminalId: current.terminalId,
  });
  return applyResult(current, result);
}
