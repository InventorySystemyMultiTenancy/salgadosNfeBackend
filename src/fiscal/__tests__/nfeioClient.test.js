import { describe, it, expect, vi } from "vitest";
import { emitNFCe } from "../nfeioClient.js";

const settings = {
  gatewayApiKey: "fake-api-key",
  gatewayCompanyId: "company-123",
};

const order = {
  id: 42,
  paymentMethod: "PIX",
  totalAmount: "15.00",
  client: {
    name: "Fulano",
    cpf: "123.456.789-00",
    addressStreet: "Rua Exemplo",
    addressNumber: "100",
    addressDistrict: "Centro",
    addressCity: "São Paulo",
    addressCityCode: "3550308",
    addressState: "SP",
    addressPostalCode: "01001-000",
  },
  items: [
    {
      productId: 1,
      quantity: 2,
      unitPrice: "7.50",
      product: { name: "Coxinha", ncm: "19022000", cfop: "5102" },
    },
  ],
};

function httpClientReturning(invoiceStatus, extra = {}) {
  const post = vi.fn().mockResolvedValue({ data: { id: "inv-1" } });
  const get = vi.fn().mockResolvedValue({ data: { id: "inv-1", status: invoiceStatus, ...extra } });
  return { post, get };
}

describe("nfeioClient.emitNFCe", () => {
  it("rejeita quando o pedido não tem cliente com endereço vinculado", async () => {
    const httpClient = httpClientReturning("Issued");

    await expect(emitNFCe({ settings, order: { ...order, client: null } }, httpClient)).rejects.toThrow(
      "endereço completo",
    );
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("rejeita quando o companyId não está configurado", async () => {
    const httpClient = httpClientReturning("Issued");

    await expect(
      emitNFCe({ settings: { ...settings, gatewayCompanyId: null }, order }, httpClient),
    ).rejects.toThrow("Id da empresa na NFe.io não configurado");
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it("monta a requisição pro endpoint de productinvoices com a api key no header Authorization", async () => {
    const httpClient = httpClientReturning("Issued", { authorization: { accessKey: "chave-123" } });

    await emitNFCe({ settings, order }, httpClient, { delayMs: 0 });

    expect(httpClient.post).toHaveBeenCalledWith(
      "https://api.nfse.io/v2/companies/company-123/productinvoices",
      expect.any(Object),
      { headers: { Authorization: "fake-api-key" } },
    );
  });

  it("monta buyer, items e payment a partir do pedido", async () => {
    const httpClient = httpClientReturning("Issued", { authorization: { accessKey: "chave-123" } });

    await emitNFCe({ settings, order }, httpClient, { delayMs: 0 });

    const payload = httpClient.post.mock.calls[0][1];
    expect(payload.buyer).toEqual({
      name: "Fulano",
      federalTaxNumber: "12345678900",
      address: {
        country: "BRA",
        postalCode: "01001000",
        street: "Rua Exemplo",
        number: "100",
        district: "Centro",
        city: { code: "3550308", name: "São Paulo" },
        state: "SP",
      },
    });
    expect(payload.items).toEqual([
      {
        code: "1",
        description: "Coxinha",
        ncm: "19022000",
        cfop: "5102",
        quantity: 2,
        unitAmount: 7.5,
        tax: {
          icms: { origin: 0, csosn: "102" },
          pis: { cst: "07" },
          cofins: { cst: "07" },
        },
      },
    ]);
    expect(payload.payment).toEqual([{ paymentDetail: [{ method: "InstantPayment", amount: 15 }] }]);
  });

  it("mapeia forma de pagamento fiado (TAB) pra WithoutPayment", async () => {
    const httpClient = httpClientReturning("Issued", { authorization: { accessKey: "chave-123" } });

    await emitNFCe({ settings, order: { ...order, paymentMethod: "TAB" } }, httpClient, { delayMs: 0 });

    const payload = httpClient.post.mock.calls[0][1];
    expect(payload.payment[0].paymentDetail[0].method).toBe("WithoutPayment");
  });

  it("devolve AUTHORIZED com a chave de acesso quando o status final é Issued", async () => {
    const httpClient = httpClientReturning("Issued", { authorization: { accessKey: "chave-123" } });

    const result = await emitNFCe({ settings, order }, httpClient, { delayMs: 0 });

    expect(result).toEqual({ fiscalStatus: "AUTHORIZED", fiscalKey: "chave-123", message: null });
  });

  it("devolve REJECTED com a mensagem da SEFAZ quando o status final é Error", async () => {
    const httpClient = httpClientReturning("Error", {
      lastEvents: {
        events: [{ type: "AuthorizationWithFailed", data: { message: "Rejeição: CNPJ não habilitado" } }],
      },
    });

    const result = await emitNFCe({ settings, order }, httpClient, { delayMs: 0 });

    expect(result).toEqual({ fiscalStatus: "REJECTED", fiscalKey: null, message: "Rejeição: CNPJ não habilitado" });
  });

  it("devolve PENDING quando o status não fecha dentro da janela de espera", async () => {
    const httpClient = httpClientReturning("Processing");

    const result = await emitNFCe({ settings, order }, httpClient, { attempts: 1, delayMs: 0 });

    expect(result.fiscalStatus).toBe("PENDING");
    expect(result.message).toContain("inv-1");
  });

  it("repassa a mensagem de erro da NFe.io quando o POST falha", async () => {
    const post = vi.fn().mockRejectedValue({ response: { data: { errors: [{ message: "buyer cannot be null" }] } } });
    const get = vi.fn();

    await expect(emitNFCe({ settings, order }, { post, get })).rejects.toThrow("buyer cannot be null");
  });
});
