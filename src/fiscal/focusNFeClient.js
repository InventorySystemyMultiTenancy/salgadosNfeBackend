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
 * com a API key como usuário. Testada contra o ambiente de homologação real; nomes de campo
 * conferidos com a doc oficial (ex: "codigo_ncm", não "ncm").
 *
 * Simplificação assumida (compatível com "cadastro simplificado" do escopo): emissor no regime
 * Simples Nacional, CSOSN 102 (tributada pelo Simples Nacional, sem permissão de crédito) em
 * todos os itens, sem frete, venda presencial, unidade "UN". Isso cobre o caso comum de uma
 * salgaderia pequena; um regime tributário diferente exigiria parametrizar CST/CSOSN por produto,
 * o que fica fora do escopo desta fase.
 *
 * Grupo UB (IBS/CBS, Reforma Tributária EC 132/2023): obrigatório em toda NFC-e a partir de 2026,
 * mesmo em fase de teste — confirmado contra a API real (SEFAZ rejeita sem esses campos). Nomes de
 * campo e tags XML conferidos em https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html. Só o
 * subconjunto essencial pra uma venda simples é enviado (sem diferimento, devolução, crédito
 * presumido, ZFM ou monofásico — regimes especiais que não se aplicam a uma salgaderia comum).
 * Alíquotas/códigos padrão ficam configuráveis em Fiscal > Configurações; CONFIRME com um contador
 * antes de valer como emissão real.
 */
export async function emitNFCe({ settings, order }, httpClient = axios) {
  const baseUrl = settings.environment === "PRODUCTION" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
  const ref = `order-${order.id}`;

  const items = order.items.map((item, index) => {
    const valorBruto = Number(item.unitPrice) * item.quantity;
    const cbsValor = round2((valorBruto * Number(settings.cbsRate)) / 100);
    const ibsUfValor = round2((valorBruto * Number(settings.ibsUfRate)) / 100);
    const ibsMunValor = round2((valorBruto * Number(settings.ibsMunRate)) / 100);

    return {
      numero_item: index + 1,
      codigo_produto: String(item.productId),
      descricao: item.product.name,
      codigo_ncm: item.product.ncm || "00000000",
      cfop: item.product.cfop || "5102",
      unidade_comercial: "UN",
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: Number(item.unitPrice),
      unidade_tributavel: "UN",
      quantidade_tributavel: item.quantity,
      valor_unitario_tributavel: Number(item.unitPrice),
      valor_bruto: valorBruto,
      icms_origem: "0", // mercadoria nacional
      icms_situacao_tributaria: "102", // CSOSN — Simples Nacional, sem permissão de crédito
      // Grupo UB — IBS/CBS (Reforma Tributária)
      ibs_cbs_situacao_tributaria: settings.ibsCbsSituacaoTributaria,
      ibs_cbs_classificacao_tributaria: settings.ibsCbsClassificacaoTributaria,
      ibs_cbs_base_calculo: valorBruto,
      cbs_aliquota: Number(settings.cbsRate),
      cbs_valor: cbsValor,
      ibs_uf_aliquota: Number(settings.ibsUfRate),
      ibs_uf_valor: ibsUfValor,
      ibs_mun_aliquota: Number(settings.ibsMunRate),
      ibs_mun_valor: ibsMunValor,
      ibs_valor_total: round2(ibsUfValor + ibsMunValor),
    };
  });

  const payload = {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: new Date().toISOString(),
    presenca_comprador: 1, // operação presencial
    modalidade_frete: 9, // sem frete
    local_destino: 1, // operação interna (mesmo estado)
    cnpj_emitente: settings.cnpj,
    // Município (código IBGE, 7 dígitos) do fato gerador do IBS/CBS — tag cMunFGIBS
    ibs_cbs_municipio: settings.ibsCbsMunicipioCodigo,
    items,
    formas_pagamento: [
      {
        forma_pagamento: PAYMENT_CODE[order.paymentMethod] ?? "99",
        valor_pagamento: Number(order.totalAmount),
      },
    ],
    // Totais do Grupo UB no nível do documento
    cbs_valor_total: round2(sum(items, "cbs_valor")),
    ibs_uf_valor_total: round2(sum(items, "ibs_uf_valor")),
    ibs_valor_total: round2(sum(items, "ibs_valor_total")),
    ibs_cbs_base_calculo: round2(sum(items, "ibs_cbs_base_calculo")),
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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function sum(items, field) {
  return items.reduce((total, item) => total + item[field], 0);
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
