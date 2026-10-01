import axios from "axios";

const BASE_URL = "https://api.mercadopago.com";

// Status da order do MP -> TerminalPaymentStatus
const STATUS_MAP = {
  created: "PENDING",
  at_terminal: "PENDING",
  action_required: "PENDING",
  processed: "APPROVED",
  canceled: "CANCELED",
  expired: "CANCELED",
  failed: "FAILED",
  refunded: "REFUNDED",
};

export const supportedMethods = ["DEBIT", "CREDIT", "PIX"];

/**
 * Integração com o Mercado Pago Point (maquininha) pela API unificada de orders
 * (https://www.mercadopago.com.br/developers/pt/reference/in-person-payments/point/orders/create-order),
 * a mesma usada no duBob. Autenticação Bearer com o Access Token de produção da conta dona da
 * maquininha.
 *
 * A maquininha precisa estar em modo PDV pra receber cobranças pela API (`setupTerminal`, depois
 * reiniciar o aparelho). O cliente escolhe débito/crédito/Pix no próprio aparelho — o tipo usado
 * volta em `paymentType`.
 *
 * Cancelamento: a API só cancela enquanto a order ainda não chegou no aparelho ("created"). Depois
 * disso ("at_terminal") o MP responde 409 e o cancelamento tem que ser feito na própria maquininha.
 */
function authHeaders(settings, idempotencyKey) {
  const headers = { Authorization: `Bearer ${settings.apiKey}` };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
  return { headers };
}

function extractErrorMessage(error) {
  const data = error.response?.data;
  return data?.errors?.[0]?.message || data?.message || error.message;
}

async function call(fn) {
  try {
    const response = await fn();
    return response.data;
  } catch (error) {
    const wrapped = new Error(`Mercado Pago: ${extractErrorMessage(error)}`);
    wrapped.status = error.response?.status;
    throw wrapped;
  }
}

function normalize(order) {
  const payment = order?.transactions?.payments?.[0];
  return {
    providerId: order.id,
    status: STATUS_MAP[order.status] ?? "PENDING",
    providerStatus: order.status ?? null,
    statusDetail: payment?.status_detail ?? order.status_detail ?? null,
    paymentType: payment?.payment_method?.type ?? null,
  };
}

export async function listTerminals({ settings }, http = axios) {
  const data = await call(() => http.get(`${BASE_URL}/terminals/v1/list?limit=50`, authHeaders(settings)));
  return (data?.data?.terminals ?? []).map((terminal) => ({
    id: terminal.id,
    label: terminal.external_pos_id ? `${terminal.id} (${terminal.external_pos_id})` : terminal.id,
    // Sem modo PDV a maquininha não recebe cobrança pela API.
    needsSetup: terminal.operating_mode !== "PDV",
    statusLabel: terminal.operating_mode === "PDV" ? "Modo PDV" : terminal.operating_mode ?? null,
  }));
}

export async function setupTerminal({ settings, terminalId }, http = axios) {
  await call(() =>
    http.patch(
      `${BASE_URL}/terminals/v1/setup`,
      { terminals: [{ id: terminalId, operating_mode: "PDV" }] },
      authHeaders(settings),
    ),
  );
}

export async function createCharge({ settings, amount, reference, description }, http = axios) {
  const order = await call(() =>
    http.post(
      `${BASE_URL}/v1/orders`,
      {
        type: "point",
        external_reference: reference,
        description,
        transactions: { payments: [{ amount: Number(amount).toFixed(2) }] },
        config: { point: { terminal_id: settings.terminalId, print_on_terminal: "no_ticket" } },
      },
      authHeaders(settings, reference),
    ),
  );
  return normalize(order);
}

export async function getCharge({ settings, providerId }, http = axios) {
  const order = await call(() => http.get(`${BASE_URL}/v1/orders/${providerId}`, authHeaders(settings)));
  return normalize(order);
}

export async function cancelCharge({ settings, providerId }, http = axios) {
  try {
    const order = await call(() =>
      http.post(`${BASE_URL}/v1/orders/${providerId}/cancel`, undefined, authHeaders(settings, `cancel-${providerId}`)),
    );
    return normalize(order);
  } catch (error) {
    if (error.status === 409) {
      throw new Error("A cobrança já está na maquininha. Cancele direto no aparelho (botão vermelho).");
    }
    throw error;
  }
}
