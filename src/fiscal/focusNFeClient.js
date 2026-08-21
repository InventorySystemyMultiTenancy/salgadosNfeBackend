import axios from "axios";

const SANDBOX_BASE_URL = "https://homologacao.focusnfe.com.br";
const PRODUCTION_BASE_URL = "https://api.focusnfe.com.br";

// Códigos de forma de pagamento da tabela SEFAZ (tPag), usados também pela Focus NFe.
const PAYMENT_CODE = {
  CASH: "01", // Dinheiro
  DEBIT: "04", // Cartão de Débito
  CREDIT: "03", // Cartão de Crédito
  PIX: "17", // Pix
  TAB: "99", // Outros — fiado é uma condição interna nossa, sem código SEFAZ próprio
};

/**
 * Integração com a Focus NFe (https://focusnfe.com.br). Montada a partir da documentação pública
 * da API (https://doc.focusnfe.com.br/reference/emitir_nfce) — POST /v2/nfce, autenticação Basic
 * com a API key como usuário. Não foi testada contra a API real: não há credenciais de sandbox
 * disponíveis neste projeto ainda.
 *
 * Simplificação assumida (compatível com "cadastro simplificado" do escopo): emissor no regime
 * Simples Nacional, CSOSN 102 (tributada pelo Simples Nacional, sem permissão de crédito) em
 * todos os itens, sem frete, venda presencial, unidade "UN". Isso cobre o caso comum de uma
 * salgaderia pequena; um regime tributário diferente exigiria parametrizar CST/CSOSN por produto,
 * o que fica fora do escopo desta fase.
 */
export async function emitNFCe({ settings, order }, httpClient = axios) {
  const baseUrl = settings.environment === "PRODUCTION" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
  const ref = `order-${order.id}`;

  const payload = {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: new Date().toISOString(),
    presenca_comprador: 1, // operação presencial
    modalidade_frete: 9, // sem frete
    local_destino: 1, // operação interna (mesmo estado)
    cnpj_emitente: settings.cnpj,
    items: order.items.map((item, index) => ({
      numero_item: index + 1,
      codigo_produto: String(item.productId),
      descricao: item.product.name,
      ncm: item.product.ncm || "00000000",
      cfop: item.product.cfop || "5102",
      unidade_comercial: "UN",
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: Number(item.unitPrice),
      unidade_tributavel: "UN",
      quantidade_tributavel: item.quantity,
      valor_unitario_tributavel: Number(item.unitPrice),
      valor_bruto: Number(item.unitPrice) * item.quantity,
      origem_icms: "0", // mercadoria nacional
      situacao_tributaria: "102", // CSOSN — Simples Nacional, sem permissão de crédito
    })),
    formas_pagamento: [
      {
        forma_pagamento: PAYMENT_CODE[order.paymentMethod] ?? "99",
        valor_pagamento: Number(order.totalAmount),
      },
    ],
  };

  let response;
  try {
    response = await httpClient.post(`${baseUrl}/v2/nfce?ref=${ref}`, payload, {
      auth: { username: settings.gatewayApiKey, password: "" },
    });
  } catch (error) {
    throw new Error(describeFocusNFeError(error));
  }

  return {
    status: response.data.status,
    fiscalKey: response.data.chave_nfe ?? null,
    message: response.data.mensagem_sefaz ?? null,
  };
}

// A Focus NFe retorna 201 tanto pra autorizado quanto pra erro_autorizacao (tratado no service).
// Erros de HTTP (400/401/403/422) chegam aqui como rejeição do axios, com o motivo real no corpo.
function describeFocusNFeError(error) {
  const data = error.response?.data;
  if (!data) {
    return `Falha ao conectar com a Focus NFe: ${error.message}`;
  }

  const details = Array.isArray(data.erros)
    ? data.erros.map((item) => `${item.campo ? `${item.campo}: ` : ""}${item.mensagem}`).join("; ")
    : null;

  return [data.mensagem, details].filter(Boolean).join(" — ") || JSON.stringify(data);
}
