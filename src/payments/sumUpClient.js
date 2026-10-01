import axios from "axios";

const BASE_URL = "https://api.sumup.com";

// Status da reader checkout -> TerminalPaymentStatus
const STATUS_MAP = {
  pending: "PENDING",
  successful: "APPROVED",
  failed: "FAILED",
  cancelled: "CANCELED",
};

// O PDV manda a forma escolhida pelo operador; a SumUp exige crédito/débito definido na cobrança.
const CARD_TYPE = { CREDIT: "credit", DEBIT: "debit" };

// Pix não é suportado pela Cloud API — na SumUp ele continua avulso.
export const supportedMethods = ["DEBIT", "CREDIT"];

/**
 * Integração com a SumUp Solo pela Cloud API
 * (https://developer.sumup.com/terminal-payments/cloud-api, referência em
 * https://developer.sumup.com/api/readers). Autenticação Bearer com a API key da conta
 * (me.sumup.com > Configurações > Para Desenvolvedores > Toolkit > API Keys); todas as rotas são
 * por merchant code (`settings.accountId`).
 *
 * A Solo precisa ser pareada com a conta via API: no aparelho, deslogado e com internet, Conexões >
 * API > Conectar gera um código de 8-9 caracteres (válido por 5 min) que vai em `pairTerminal`.
 *
 * Toda cobrança exige a Affiliate Key do app (SUMUP_AFFILIATE_KEY / SUMUP_AFFILIATE_APP_ID no .env)
 * — é do sistema, não da loja, por isso não fica em Config. Pagamento.
 *
 * Cancelamento (`terminate`) é assíncrono e só funciona enquanto a Solo está esperando cartão/senha:
 * a API responde 204 e o status vira "cancelled"/"failed" logo depois, então o PDV segue
 * consultando até o status final.
 */
function authHeaders(settings) {
  return { headers: { Authorization: `Bearer ${settings.apiKey}` } };
}

function merchantPath(settings) {
  if (!settings.accountId) {
    throw new Error("Informe o merchant code da SumUp em Config. Pagamento.");
  }
  return `${BASE_URL}/v0.1/merchants/${encodeURIComponent(settings.accountId)}`;
}

function extractErrorMessage(error) {
  const data = error.response?.data;
  return data?.detail || data?.message || data?.title || error.message;
}

async function call(fn) {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    const wrapped = new Error(`SumUp: ${extractErrorMessage(error)}`);
    wrapped.status = error.response?.status;
    throw wrapped;
  }
}

function affiliate(reference) {
  const key = process.env.SUMUP_AFFILIATE_KEY;
  const appId = process.env.SUMUP_AFFILIATE_APP_ID;
  if (!key || !appId) {
    throw new Error("SUMUP_AFFILIATE_KEY e SUMUP_AFFILIATE_APP_ID não configurados no .env do backend.");
  }
  return { key, app_id: appId, foreign_transaction_id: reference };
}

function normalize(checkout) {
  return {
    providerId: checkout.checkout_id,
    status: STATUS_MAP[checkout.status] ?? "PENDING",
    providerStatus: checkout.status ?? null,
    statusDetail: checkout.payment_failure_reason ?? null,
    // Mesmo vocabulário do Mercado Pago, pro resolvePaymentMethod tratar os dois igual.
    paymentType: checkout.card_type ? `${checkout.card_type}_card` : null,
  };
}

export async function listTerminals({ settings }, http = axios) {
  const data = await call(() => http.get(`${merchantPath(settings)}/readers`, authHeaders(settings)));
  return (data?.items ?? []).map((reader) => ({
    id: reader.id,
    label: reader.device?.identifier ? `${reader.name} (${reader.device.identifier})` : reader.name,
    needsSetup: false,
    statusLabel: reader.status === "paired" ? "Pareada" : reader.status,
  }));
}

export async function pairTerminal({ settings, pairingCode, name }, http = axios) {
  const reader = await call(() =>
    http.post(
      `${merchantPath(settings)}/readers`,
      { pairing_code: pairingCode.trim().toUpperCase(), name },
      authHeaders(settings),
    ),
  );
  return { id: reader.id, label: reader.name };
}

export async function createCharge({ settings, amount, paymentMethod, reference, description }, http = axios) {
  const cardType = CARD_TYPE[paymentMethod];
  if (!cardType) {
    throw new Error("A maquininha SumUp só cobra Débito ou Crédito. Pix continua avulso.");
  }

  const data = await call(() =>
    http.post(
      `${merchantPath(settings)}/readers/${settings.terminalId}/checkout`,
      {
        total_amount: { currency: "BRL", minor_unit: 2, value: Math.round(Number(amount) * 100) },
        description,
        card_type: cardType,
        affiliate: affiliate(reference),
      },
      authHeaders(settings),
    ),
  );

  return {
    providerId: data.data.checkout_id,
    status: "PENDING",
    providerStatus: "pending",
    statusDetail: null,
    paymentType: `${cardType}_card`,
  };
}

export async function getCharge({ settings, providerId, terminalId }, http = axios) {
  const data = await call(() =>
    http.get(
      `${merchantPath(settings)}/readers/${terminalId ?? settings.terminalId}/checkout/${providerId}`,
      authHeaders(settings),
    ),
  );
  return normalize(data.data);
}

export async function cancelCharge({ settings, providerId, terminalId }, http = axios) {
  try {
    await call(() =>
      http.post(
        `${merchantPath(settings)}/readers/${terminalId ?? settings.terminalId}/terminate`,
        undefined,
        authHeaders(settings),
      ),
    );
  } catch (error) {
    if (error.status === 422 || error.status === 409 || error.status === 400) {
      throw new Error("A maquininha não está mais aguardando o cartão. Cancele direto no aparelho.");
    }
    throw error;
  }
  // O terminate é assíncrono: devolve o status atual e o PDV segue consultando até finalizar.
  return getCharge({ settings, providerId, terminalId }, http);
}
