import { describe, it, expect, vi } from "vitest";
import { createCharge, getCharge, cancelCharge, listTerminals } from "../mercadoPagoClient.js";
import { resolvePaymentMethod } from "../paymentMethod.js";

const settings = { apiKey: "APP_USR-fake", terminalId: "NEWLAND_N950__N950NCB801293324" };
const auth = expect.objectContaining({
  headers: expect.objectContaining({ Authorization: "Bearer APP_USR-fake" }),
});

describe("mercadoPagoClient.createCharge", () => {
  it("cria uma order point pra maquininha configurada com o valor em string de 2 casas", async () => {
    const post = vi.fn().mockResolvedValue({ data: { id: "ORD01", status: "created" } });

    const result = await createCharge({ settings, amount: 15, reference: "ref-1", description: "Teste" }, { post });

    expect(post).toHaveBeenCalledWith(
      "https://api.mercadopago.com/v1/orders",
      expect.objectContaining({
        type: "point",
        external_reference: "ref-1",
        transactions: { payments: [{ amount: "15.00" }] },
        config: { point: { terminal_id: settings.terminalId, print_on_terminal: "no_ticket" } },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer APP_USR-fake", "X-Idempotency-Key": "ref-1" }),
      }),
    );
    expect(result).toMatchObject({ providerId: "ORD01", status: "PENDING", providerStatus: "created" });
  });

  it("repassa a mensagem de erro do Mercado Pago", async () => {
    const post = vi.fn().mockRejectedValue({
      message: "Request failed",
      response: { status: 400, data: { errors: [{ message: "terminal not found" }] } },
    });

    await expect(
      createCharge({ settings, amount: 10, reference: "ref-2", description: "Teste" }, { post }),
    ).rejects.toThrow("Mercado Pago: terminal not found");
  });
});

describe("mercadoPagoClient.getCharge", () => {
  it.each([
    ["at_terminal", "PENDING"],
    ["processed", "APPROVED"],
    ["canceled", "CANCELED"],
    ["expired", "CANCELED"],
    ["failed", "FAILED"],
    ["refunded", "REFUNDED"],
  ])("status %s do MP vira %s", async (mpStatus, expected) => {
    const get = vi.fn().mockResolvedValue({ data: { id: "ORD01", status: mpStatus } });
    const result = await getCharge({ settings, providerId: "ORD01" }, { get });
    expect(get).toHaveBeenCalledWith("https://api.mercadopago.com/v1/orders/ORD01", auth);
    expect(result.status).toBe(expected);
  });

  it("devolve o tipo de pagamento usado no aparelho", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        id: "ORD01",
        status: "processed",
        transactions: { payments: [{ status_detail: "accredited", payment_method: { type: "debit_card" } }] },
      },
    });
    const result = await getCharge({ settings, providerId: "ORD01" }, { get });
    expect(result).toMatchObject({ statusDetail: "accredited", paymentType: "debit_card" });
  });
});

describe("mercadoPagoClient.cancelCharge", () => {
  it("cancela pela rota /cancel", async () => {
    const post = vi.fn().mockResolvedValue({ data: { id: "ORD01", status: "canceled" } });
    const result = await cancelCharge({ settings, providerId: "ORD01" }, { post });
    expect(post).toHaveBeenCalledWith("https://api.mercadopago.com/v1/orders/ORD01/cancel", undefined, auth);
    expect(result.status).toBe("CANCELED");
  });

  it("explica que tem que cancelar no aparelho quando a order já está na maquininha (409)", async () => {
    const post = vi.fn().mockRejectedValue({ message: "conflict", response: { status: 409, data: {} } });
    await expect(cancelCharge({ settings, providerId: "ORD01" }, { post })).rejects.toThrow(
      "Cancele direto no aparelho",
    );
  });
});

describe("mercadoPagoClient.listTerminals", () => {
  it("lista as maquininhas e marca as que ainda não estão em modo PDV", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        data: {
          terminals: [
            { id: "T1", external_pos_id: "CAIXA1", operating_mode: "STANDALONE" },
            { id: "T2", operating_mode: "PDV" },
          ],
        },
      },
    });
    expect(await listTerminals({ settings }, { get })).toEqual([
      { id: "T1", label: "T1 (CAIXA1)", needsSetup: true, statusLabel: "STANDALONE" },
      { id: "T2", label: "T2", needsSetup: false, statusLabel: "Modo PDV" },
    ]);
  });
});

describe("resolvePaymentMethod", () => {
  it.each([
    ["credit_card", "DEBIT", "CREDIT"],
    ["debit_card", "CREDIT", "DEBIT"],
    ["qr", "CREDIT", "PIX"],
    [null, "PIX", "PIX"],
    ["algo_novo", "DEBIT", "DEBIT"],
  ])("tipo %s com fallback %s vira %s", (type, fallback, expected) => {
    expect(resolvePaymentMethod(type, fallback)).toBe(expected);
  });
});
