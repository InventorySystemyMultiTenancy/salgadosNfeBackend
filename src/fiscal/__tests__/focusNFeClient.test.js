import { describe, it, expect, vi } from "vitest";
import { emitNFCe } from "../focusNFeClient.js";

const settings = {
  cnpj: "12345678000199",
  gatewayApiKey: "fake-api-key",
  environment: "SANDBOX",
  icmsRate: 7,
  cbsRate: 0.9,
  ibsUfRate: 0.05,
  ibsMunRate: 0.05,
  ibsCbsSituacaoTributaria: "000",
  ibsCbsClassificacaoTributaria: "000001",
  ibsCbsMunicipioCodigo: "3550308",
};

const order = {
  id: 42,
  paymentMethod: "PIX",
  totalAmount: "15.00",
  items: [
    {
      productId: 1,
      quantity: 2,
      unitPrice: "7.50",
      product: { name: "Coxinha", ncm: "19022000", cfop: "5102" },
    },
  ],
};

describe("focusNFeClient.emitNFCe", () => {
  it("monta a requisição para o endpoint de homologação com Basic Auth e ref do pedido", async () => {
    const post = vi.fn().mockResolvedValue({ data: { status: "autorizado", chave_nfe: "chave-123" } });

    await emitNFCe({ settings, order }, { post });

    expect(post).toHaveBeenCalledWith(
      "https://homologacao.focusnfe.com.br/v2/nfce?ref=order-42",
      expect.any(Object),
      { auth: { username: "fake-api-key", password: "" } },
    );
  });

  it("inclui os campos obrigatórios documentados pela Focus NFe", async () => {
    const post = vi.fn().mockResolvedValue({ data: { status: "autorizado", chave_nfe: "chave-123" } });

    await emitNFCe({ settings, order }, { post });

    const payload = post.mock.calls[0][1];
    expect(payload).toMatchObject({
      cnpj_emitente: "12345678000199",
      presenca_comprador: 1,
      modalidade_frete: 9,
      local_destino: 1,
      natureza_operacao: expect.any(String),
      ibs_cbs_municipio: "3550308",
    });
    expect(payload.data_emissao).toEqual(expect.any(String));
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      codigo_ncm: "19022000",
      cfop: "5102",
      quantidade_comercial: 2,
      valor_unitario_comercial: 7.5,
      valor_bruto: 15,
      icms_origem: "0",
      icms_situacao_tributaria: "102",
      ibs_cbs_situacao_tributaria: "000",
      ibs_cbs_classificacao_tributaria: "000001",
      ibs_cbs_base_calculo: 15,
      cbs_aliquota: 0.9,
      cbs_valor: 0.14,
      ibs_uf_aliquota: 0.05,
      ibs_uf_valor: 0.01,
      ibs_mun_aliquota: 0.05,
      ibs_mun_valor: 0.01,
      ibs_valor_total: 0.02,
    });
    expect(payload.formas_pagamento).toEqual([{ forma_pagamento: "17", valor_pagamento: 15 }]);
    expect(payload).toMatchObject({
      cbs_valor_total: 0.14,
      ibs_uf_valor_total: 0.01,
      ibs_valor_total: 0.02,
      ibs_cbs_base_calculo: 15,
    });
  });

  it("remove pontuação do CNPJ antes de enviar (evita 'CNPJ Emitente não cadastrado')", async () => {
    const post = vi.fn().mockResolvedValue({ data: { status: "autorizado" } });

    await emitNFCe({ settings: { ...settings, cnpj: "12.345.678/0001-99" }, order }, { post });

    const payload = post.mock.calls[0][1];
    expect(payload.cnpj_emitente).toBe("12345678000199");
  });

  it("omite ibs_cbs_municipio quando não configurado (venda presencial padrão)", async () => {
    const post = vi.fn().mockResolvedValue({ data: { status: "autorizado" } });

    await emitNFCe({ settings: { ...settings, ibsCbsMunicipioCodigo: null }, order }, { post });

    const payload = post.mock.calls[0][1];
    expect(payload).not.toHaveProperty("ibs_cbs_municipio");
  });

  it("usa o endpoint de produção quando o ambiente é PRODUCTION", async () => {
    const post = vi.fn().mockResolvedValue({ data: { status: "autorizado" } });

    await emitNFCe({ settings: { ...settings, environment: "PRODUCTION" }, order }, { post });

    expect(post.mock.calls[0][0]).toContain("https://api.focusnfe.com.br/v2/nfce");
  });

  it("repassa status e mensagem quando a SEFAZ rejeita a nota", async () => {
    const post = vi.fn().mockResolvedValue({
      data: { status: "erro_autorizacao", mensagem_sefaz: "CNPJ não habilitado" },
    });

    const result = await emitNFCe({ settings, order }, { post });

    expect(result).toEqual({ fiscalStatus: "REJECTED", fiscalKey: null, message: "CNPJ não habilitado" });
  });
});
