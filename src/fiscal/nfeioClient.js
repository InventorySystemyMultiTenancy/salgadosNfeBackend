import axios from "axios";

const BASE_URL = "https://api.nfse.io";

// Confirmado batendo contra o endpoint real (POST /v2/companies/{id}/productinvoices) em
// 2026-08-24, sandbox (environmentType "Test", SEFAZ-SP retornou "SEM VALOR FISCAL").
const PAYMENT_METHOD = {
  CASH: "Cash",
  DEBIT: "DebitCard",
  CREDIT: "CreditCard",
  PIX: "InstantPayment",
  TAB: "WithoutPayment", // fiado — sem pagamento no ato da venda
};

/**
 * Integração com a NFe.io (https://nfe.io) para emissão de Nota Fiscal de Produto/Consumidor —
 * POST /v2/companies/{companyId}/productinvoices, autenticação via header Authorization com a
 * api key crua. Ao contrário do restante deste arquivo de comentário no focusNFeClient.js, TUDO
 * aqui foi confirmado testando contra a API real (não só a doc pública, que é incompleta/imprecisa
 * em vários pontos — ex: a doc não menciona que buyer+address são obrigatórios).
 *
 * Descobertas relevantes do teste real:
 * - buyer (nome, federalTaxNumber, address completo) é OBRIGATÓRIO em toda nota, mesmo de balcão.
 *   Isso é um problema de produto, não só de código: o model Client deste projeto não tem endereço
 *   (só name/phone/cpf), e uma venda sem cliente vinculado (CASH/DEBIT/CREDIT/PIX) não coleta
 *   identificação nenhuma. Por isso emitNFCe lança erro explícito nesse caso em vez de inventar um
 *   endereço — mandar endereço fictício numa nota fiscal de verdade seria simplesmente errado.
 *   Ver se a NFe.io tem um fluxo específico de NFC-e/consumidor não identificado (pode ser outro
 *   campo, tipo model/series, que não foi descoberto nesse teste) antes de assumir que isso é uma
 *   limitação definitiva da API.
 * - Grupos de imposto por item são obrigatórios: icms{origin, csosn}, pis{cst}, cofins{cst}. Usa
 *   CSOSN 102 e CST 07 (mesma lógica do focusNFeClient.js: Simples Nacional, tributação simplificada,
 *   sem detalhamento de base/alíquota) — CONFIRME com um contador se é o enquadramento certo.
 * - Grupo UB (IBS/CBS, Reforma Tributária) NÃO foi exigido nesse teste — diferente do que o
 *   focusNFeClient.js encontrou na Focus NFe. Pode ser que a NFe.io já calcule isso automaticamente,
 *   ou que esse ambiente específico (SEFAZ-SP homologação, schema SP_NFE_PL009_V4) ainda não valide.
 *   Reconfirme antes de considerar isso resolvido, principalmente depois que a validação plena da
 *   Reforma Tributária entrar em vigor.
 * - status do documento: "Processing" (inicial) → "Issued" (autorizado) | "Error" (rejeitado),
 *   consultado via GET /v2/companies/{companyId}/productinvoices/{id}. O accessKey (chave de
 *   44 dígitos) só é válido de verdade quando status é "Issued" — ele já vem preenchido mesmo em
 *   notas rejeitadas (a NFe.io gera o número/chave antes de submeter à SEFAZ).
 */
export async function emitNFCe({ settings, order }, httpClient = axios, pollOptions = {}) {
  const companyId = settings.gatewayCompanyId;
  if (!companyId) {
    throw new Error("Id da empresa na NFe.io não configurado (Fiscal > Configurações).");
  }

  if (!order.client?.addressStreet || !order.client?.addressCityCode) {
    throw new Error(
      "A NFe.io exige nome, CPF/CNPJ e endereço completo do comprador em toda nota — " +
        "esse pedido não tem um cliente com endereço cadastrado (Clientes > editar). Ainda não " +
        "há suporte a venda anônima de balcão nesse gateway; use a Focus NFe para esse fluxo.",
    );
  }

  const items = order.items.map((item) => ({
    code: String(item.productId),
    description: item.product.name,
    ncm: item.product.ncm || "00000000",
    cfop: item.product.cfop || "5102",
    quantity: item.quantity,
    unitAmount: Number(item.unitPrice),
    tax: {
      icms: { origin: 0, csosn: "102" },
      pis: { cst: "07" },
      cofins: { cst: "07" },
    },
  }));

  const payload = {
    payment: [
      {
        paymentDetail: [
          { method: PAYMENT_METHOD[order.paymentMethod] ?? "Cash", amount: Number(order.totalAmount) },
        ],
      },
    ],
    buyer: {
      name: order.client.name,
      // CNPJ tem prioridade quando o cliente é pessoa jurídica cadastrado pra nota fiscal.
      federalTaxNumber: onlyDigits(order.client.cnpj || order.client.cpf),
      address: {
        country: "BRA",
        postalCode: onlyDigits(order.client.addressPostalCode),
        street: order.client.addressStreet,
        number: order.client.addressNumber,
        district: order.client.addressDistrict,
        city: { code: order.client.addressCityCode, name: order.client.addressCity },
        state: order.client.addressState,
      },
    },
    items,
  };

  let response;
  try {
    response = await httpClient.post(`${BASE_URL}/v2/companies/${companyId}/productinvoices`, payload, {
      headers: { Authorization: settings.gatewayApiKey },
    });
  } catch (error) {
    throw new Error(describeNfeioError(error));
  }

  return pollUntilTerminal(
    { companyId, apiKey: settings.gatewayApiKey, invoiceId: response.data.id },
    httpClient,
    pollOptions,
  );
}

// A emissão é assíncrona: o POST só devolve o id, a autorização acontece em segundo plano.
// Faz poll por um período curto (a SEFAZ-SP respondeu em ~4s nos testes) — se não fechar nesse
// tempo, devolve PENDING em vez de travar a requisição HTTP indefinidamente.
async function pollUntilTerminal({ companyId, apiKey, invoiceId }, httpClient, { attempts = 6, delayMs = 1500 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await sleep(delayMs);

    const response = await httpClient.get(`${BASE_URL}/v2/companies/${companyId}/productinvoices/${invoiceId}`, {
      headers: { Authorization: apiKey },
    });
    const invoice = response.data;

    if (invoice.status === "Issued") {
      return { fiscalStatus: "AUTHORIZED", fiscalKey: invoice.authorization?.accessKey ?? null, message: null };
    }

    if (invoice.status === "Error") {
      const failedEvent = invoice.lastEvents?.events?.find((event) => event.type === "AuthorizationWithFailed");
      return {
        fiscalStatus: "REJECTED",
        fiscalKey: null,
        message: failedEvent?.data?.message ?? "Emissão rejeitada pela SEFAZ.",
      };
    }
  }

  return {
    fiscalStatus: "PENDING",
    fiscalKey: null,
    message: `Nota enviada para emissão na NFe.io (id: ${invoiceId}), ainda processando. Consulte novamente em instantes.`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onlyDigits(value) {
  return value ? value.replace(/\D/g, "") : value;
}

function describeNfeioError(error) {
  const data = error.response?.data;
  if (!data) {
    return `Falha ao conectar com a NFe.io: ${error.message}`;
  }

  if (Array.isArray(data.errors)) {
    return data.errors.map((item) => item.message).join("; ");
  }

  return data.message || data.title || JSON.stringify(data);
}
