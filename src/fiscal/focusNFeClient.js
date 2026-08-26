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
 * Integração com a Focus NFe (https://focusnfe.com.br) — NFC-e (modelo 65, `emitNFCe`) e NF-e
 * (modelo 55, `emitNFe`, mais abaixo). Montada a partir da documentação pública
 * (https://doc.focusnfe.com.br/reference/emitir_nfce e /emitir_nfe), autenticação Basic com a API
 * key como usuário. Testada contra o ambiente de homologação real; nomes de campo conferidos com
 * a doc oficial (ex: "codigo_ncm", não "ncm").
 *
 * As duas existem porque o credenciamento na SEFAZ pra cada modelo é separado — uma empresa pode
 * ter NF-e liberada sem ter NFC-e (ou vice-versa). Ver memória do projeto (2026-08-26) pro caso
 * real que motivou isso: CNPJ com NF-e funcionando mas sem credenciamento de NFC-e ainda.
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
// Monta os itens com o Grupo UB (IBS/CBS) já calculado — compartilhado entre NFC-e e NF-e, já
// que a Reforma Tributária exige o mesmo grupo nos dois modelos (55 e 65).
function buildItems(order, settings) {
  return order.items.map((item, index) => {
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
}

export async function emitNFCe({ settings, order }, httpClient = axios) {
  const baseUrl = settings.environment === "PRODUCTION" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
  const ref = `order-${order.id}`;
  const items = buildItems(order, settings);

  const payload = {
    natureza_operacao: "Venda ao consumidor",
    data_emissao: new Date().toISOString(),
    presenca_comprador: 1, // operação presencial
    modalidade_frete: 9, // sem frete
    local_destino: 1, // operação interna (mesmo estado)
    cnpj_emitente: onlyDigits(settings.cnpj),
    // Destinatário — só enviado quando o pedido está vinculado a um cliente cadastrado (CPF ou
    // CNPJ). Sem isso a nota sai como "consumidor não identificado", mesmo tendo um cliente
    // selecionado no PDV. CNPJ tem prioridade (cliente pessoa jurídica). Nomes de campo
    // (cnpj_destinatario/cpf_destinatario/nome_destinatario) confirmados contra a doc pública em
    // 2026-08-25 (campos.focusnfe.com.br), mas ainda não testados numa emissão real com cliente.
    ...(order.client?.cnpj
      ? { cnpj_destinatario: onlyDigits(order.client.cnpj), nome_destinatario: order.client.name }
      : order.client?.cpf
        ? { cpf_destinatario: onlyDigits(order.client.cpf), nome_destinatario: order.client.name }
        : {}),
    // Município (código IBGE, tag cMunFGIBS) do fato gerador do IBS/CBS — a SEFAZ rejeitou como
    // "informado indevidamente" numa venda presencial padrão (mesmo estado do emitente), então só
    // envia quando explicitamente configurado (casos como prestação em município diferente).
    ...(settings.ibsCbsMunicipioCodigo ? { ibs_cbs_municipio: settings.ibsCbsMunicipioCodigo } : {}),
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
    fiscalStatus: response.data.status === "autorizado" ? "AUTHORIZED" : "REJECTED",
    fiscalKey: response.data.chave_nfe ?? null,
    message: response.data.mensagem_sefaz ?? null,
    danfeUrl: resolveUrl(baseUrl, response.data.caminho_danfe),
    xmlUrl: resolveUrl(baseUrl, response.data.caminho_xml_nota_fiscal),
  };
}

// A Focus devolve só o caminho relativo (ex: "/notas_fiscais_consumidor/....html") — precisa
// prefixar com o mesmo host usado na chamada (homologação/produção) pra virar um link clicável.
function resolveUrl(baseUrl, path) {
  return path ? `${baseUrl}${path}` : null;
}

/**
 * NF-e (modelo 55, https://doc.focusnfe.com.br/reference/emitir_nfe) — POST /v2/nfe. Ao contrário
 * da NFC-e, o destinatário é obrigatório (nome + CPF/CNPJ + endereço completo); por isso só emite
 * pra pedidos com cliente cadastrado. A emissão é assíncrona por padrão na Focus (resposta 202,
 * "processando_autorizacao"), então faz um poll curto em GET /v2/nfe/{ref} — se não fechar nesse
 * tempo, devolve PENDING em vez de travar a requisição.
 *
 * Existe porque nem toda empresa credenciada na SEFAZ pra emitir NFC-e (modelo 65, credenciamento
 * separado — ver memória do projeto) já tem isso liberado; NF-e (modelo 55) costuma já funcionar
 * junto do cadastro básico de contribuinte. Serve como alternativa pra vendas com cliente
 * identificado (CNPJ/CPF) enquanto o credenciamento de NFC-e não sai.
 */
export async function emitNFe({ settings, order }, httpClient = axios, pollOptions = {}) {
  if (!order.client?.addressStreet || !order.client?.addressCityCode) {
    throw new Error(
      "NF-e exige nome, CPF/CNPJ e endereço completo do destinatário — esse pedido não tem um " +
        "cliente com endereço cadastrado (Clientes > editar).",
    );
  }

  const baseUrl = settings.environment === "PRODUCTION" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
  const ref = `nfe-order-${order.id}`;
  // NF-e (diferente da NFC-e simplificada) exige o grupo PIS/COFINS por item — testado ao vivo em
  // 2026-08-26, SEFAZ-SP rejeitou sem isso ("NF-e sem grupo do PIS"). CST 07 (operação isenta da
  // contribuição) é o equivalente pro Simples Nacional sem crédito, mesma lógica do CSOSN 102 do
  // ICMS já usado nos itens.
  const items = buildItems(order, settings).map((item) => ({
    ...item,
    pis_situacao_tributaria: "07",
    cofins_situacao_tributaria: "07",
  }));

  const payload = {
    natureza_operacao: "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1, // saída
    finalidade_emissao: 1, // normal
    cnpj_emitente: onlyDigits(settings.cnpj),
    nome_emitente: settings.companyName,
    modalidade_frete: 9, // sem frete
    nome_destinatario: order.client.name,
    ...(order.client.cnpj
      ? { cnpj_destinatario: onlyDigits(order.client.cnpj) }
      : { cpf_destinatario: onlyDigits(order.client.cpf) }),
    // Se o cliente tem IE cadastrada (é contribuinte de ICMS, ex: revendedor), manda indicador "1"
    // + o número. Sem IE, "9" (não contribuinte) — caso mais comum (cliente comprando pra consumo
    // próprio). A SEFAZ cruza isso com o cadastro dela: mandar "9" pra um CNPJ que tem IE ativa lá
    // rejeita com "IE do destinatário não informada" (rejeição 232), testado ao vivo em 2026-08-26.
    ...(order.client.stateRegistration
      ? { indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: order.client.stateRegistration }
      : { indicador_inscricao_estadual_destinatario: 9 }),
    logradouro_destinatario: order.client.addressStreet,
    numero_destinatario: order.client.addressNumber,
    bairro_destinatario: order.client.addressDistrict,
    municipio_destinatario: order.client.addressCity,
    uf_destinatario: order.client.addressState,
    cep_destinatario: onlyDigits(order.client.addressPostalCode),
    items,
    valor_produtos: round2(sum(items, "valor_bruto")),
    valor_total: Number(order.totalAmount),
    // Totais do Grupo UB no nível do documento
    cbs_valor_total: round2(sum(items, "cbs_valor")),
    ibs_uf_valor_total: round2(sum(items, "ibs_uf_valor")),
    ibs_valor_total: round2(sum(items, "ibs_valor_total")),
    ibs_cbs_base_calculo: round2(sum(items, "ibs_cbs_base_calculo")),
  };

  let response;
  try {
    response = await httpClient.post(`${baseUrl}/v2/nfe?ref=${ref}`, payload, {
      auth: { username: settings.gatewayApiKey, password: "" },
    });
  } catch (error) {
    throw new Error(describeFocusNFeError(error));
  }

  if (response.data.status === "autorizado") {
    return {
      fiscalStatus: "AUTHORIZED",
      fiscalKey: response.data.chave_nfe ?? null,
      message: response.data.mensagem_sefaz ?? null,
      danfeUrl: resolveUrl(baseUrl, response.data.caminho_danfe),
      xmlUrl: resolveUrl(baseUrl, response.data.caminho_xml_nota_fiscal),
    };
  }
  if (response.data.status === "erro_autorizacao") {
    return { fiscalStatus: "REJECTED", fiscalKey: null, message: response.data.mensagem_sefaz ?? null };
  }

  return pollNFeUntilTerminal({ baseUrl, ref, apiKey: settings.gatewayApiKey }, httpClient, pollOptions);
}

async function pollNFeUntilTerminal({ baseUrl, ref, apiKey }, httpClient, { attempts = 6, delayMs = 1500 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await sleep(delayMs);

    const response = await httpClient.get(`${baseUrl}/v2/nfe/${ref}`, {
      auth: { username: apiKey, password: "" },
    });
    const nfe = response.data;

    if (nfe.status === "autorizado") {
      return {
        fiscalStatus: "AUTHORIZED",
        fiscalKey: nfe.chave_nfe ?? null,
        message: nfe.mensagem_sefaz ?? null,
        danfeUrl: resolveUrl(baseUrl, nfe.caminho_danfe),
        xmlUrl: resolveUrl(baseUrl, nfe.caminho_xml_nota_fiscal),
      };
    }
    if (nfe.status === "erro_autorizacao" || nfe.status === "cancelado") {
      return { fiscalStatus: "REJECTED", fiscalKey: null, message: nfe.mensagem_sefaz ?? "Emissão rejeitada pela SEFAZ." };
    }
  }

  return {
    fiscalStatus: "PENDING",
    fiscalKey: null,
    message: `NF-e enviada pra Focus (ref: ${ref}), ainda processando. Consulte novamente em instantes.`,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// CNPJ/CPF só devem ir com dígitos (sem pontos/barra/traço) — enviar formatado faz a SEFAZ não
// reconhecer o emitente ("CNPJ Emitente não cadastrado"), mesmo que o CNPJ esteja correto.
function onlyDigits(value) {
  return value ? value.replace(/\D/g, "") : value;
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
