import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCharge, getCharge, cancelCharge, listTerminals, pairTerminal } from "../sumUpClient.js";
import { resolvePaymentMethod } from "../paymentMethod.js";

const settings = { apiKey: "sup_sk_fake", accountId: "MABC1234", terminalId: "rdr_1" };
const auth = { headers: { Authorization: "Bearer sup_sk_fake" } };
const merchant = "https://api.sumup.com/v0.1/merchants/MABC1234";

beforeEach(() => {
  process.env.SUMUP_AFFILIATE_KEY = "aff-key";
  process.env.SUMUP_AFFILIATE_APP_ID = "com.sabordahora.pdv";
});

afterEach(() => {
  delete process.env.SUMUP_AFFILIATE_KEY;
  delete process.env.SUMUP_AFFILIATE_APP_ID;
});

describe("sumUpClient.createCharge", () => {
  it("manda a cobrança pra Solo em centavos, com o tipo de cartão e a affiliate key", async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: { checkout_id: "chk_1", client_transaction_id: "tx_1" } } });

    const result = await createCharge(
      { settings, amount: 15.5, paymentMethod: "DEBIT", reference: "ref-1", description: "Teste" },
      { post },
    );

    expect(post).toHaveBeenCalledWith(
      `${merchant}/readers/rdr_1/checkout`,
      {
        total_amount: { currency: "BRL", minor_unit: 2, value: 1550 },
        description: "Teste",
        card_type: "debit",
        affiliate: { key: "aff-key", app_id: "com.sabordahora.pdv", foreign_transaction_id: "ref-1" },
      },
      auth,
    );
    expect(result).toMatchObject({ providerId: "chk_1", status: "PENDING", paymentType: "debit_card" });
  });

  it("não aceita Pix", async () => {
    await expect(
      createCharge({ settings, amount: 10, paymentMethod: "PIX", reference: "r", description: "d" }, { post: vi.fn() }),
    ).rejects.toThrow("só cobra Débito ou Crédito");
  });

  it("exige a affiliate key no .env", async () => {
    delete process.env.SUMUP_AFFILIATE_KEY;
    await expect(
      createCharge({ settings, amount: 10, paymentMethod: "CREDIT", reference: "r", description: "d" }, { post: vi.fn() }),
    ).rejects.toThrow("SUMUP_AFFILIATE_KEY");
  });

  it("exige o merchant code", async () => {
    await expect(
      createCharge(
        { settings: { ...settings, accountId: null }, amount: 10, paymentMethod: "CREDIT", reference: "r", description: "d" },
        { post: vi.fn() },
      ),
    ).rejects.toThrow("merchant code");
  });

  it("repassa a mensagem de erro da SumUp", async () => {
    const post = vi.fn().mockRejectedValue({
      message: "Request failed",
      response: { status: 422, data: { title: "Unprocessable", detail: "Reader is offline" } },
    });
    await expect(
      createCharge({ settings, amount: 10, paymentMethod: "CREDIT", reference: "r", description: "d" }, { post }),
    ).rejects.toThrow("SumUp: Reader is offline");
  });
});

describe("sumUpClient.getCharge", () => {
  it.each([
    ["pending", "PENDING"],
    ["successful", "APPROVED"],
    ["failed", "FAILED"],
    ["cancelled", "CANCELED"],
  ])("status %s da SumUp vira %s", async (sumUpStatus, expected) => {
    const get = vi.fn().mockResolvedValue({ data: { data: { checkout_id: "chk_1", status: sumUpStatus } } });
    const result = await getCharge({ settings, providerId: "chk_1", terminalId: "rdr_9" }, { get });
    expect(get).toHaveBeenCalledWith(`${merchant}/readers/rdr_9/checkout/chk_1`, auth);
    expect(result.status).toBe(expected);
  });

  it("devolve o tipo de cartão e o motivo da falha", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { data: { checkout_id: "chk_1", status: "failed", card_type: "credit", payment_failure_reason: "declined" } },
    });
    const result = await getCharge({ settings, providerId: "chk_1" }, { get });
    expect(result).toMatchObject({ statusDetail: "declined", paymentType: "credit_card" });
    expect(resolvePaymentMethod(result.paymentType, "DEBIT")).toBe("CREDIT");
  });
});

describe("sumUpClient.cancelCharge", () => {
  it("manda o terminate pra Solo e devolve o status atual", async () => {
    const post = vi.fn().mockResolvedValue({ data: "" });
    const get = vi.fn().mockResolvedValue({ data: { data: { checkout_id: "chk_1", status: "pending" } } });

    const result = await cancelCharge({ settings, providerId: "chk_1", terminalId: "rdr_1" }, { post, get });

    expect(post).toHaveBeenCalledWith(`${merchant}/readers/rdr_1/terminate`, undefined, auth);
    expect(result.status).toBe("PENDING");
  });

  it("explica que tem que cancelar no aparelho quando a Solo não está mais esperando o cartão", async () => {
    const post = vi.fn().mockRejectedValue({ message: "x", response: { status: 422, data: {} } });
    await expect(cancelCharge({ settings, providerId: "chk_1" }, { post })).rejects.toThrow(
      "Cancele direto no aparelho",
    );
  });
});

describe("sumUpClient leitores", () => {
  it("lista as Solos pareadas", async () => {
    const get = vi.fn().mockResolvedValue({
      data: { items: [{ id: "rdr_1", name: "Caixa", status: "paired", device: { identifier: "U1DT3NA00-CN" } }] },
    });
    expect(await listTerminals({ settings }, { get })).toEqual([
      { id: "rdr_1", label: "Caixa (U1DT3NA00-CN)", needsSetup: false, statusLabel: "Pareada" },
    ]);
  });

  it("pareia com o código mostrado no aparelho", async () => {
    const post = vi.fn().mockResolvedValue({ data: { id: "rdr_2", name: "Caixa", status: "processing" } });
    const reader = await pairTerminal({ settings, pairingCode: " ab12cd34 ", name: "Caixa" }, { post });
    expect(post).toHaveBeenCalledWith(`${merchant}/readers`, { pairing_code: "AB12CD34", name: "Caixa" }, auth);
    expect(reader).toEqual({ id: "rdr_2", label: "Caixa" });
  });
});
