// Formas de pagamento do PDV que podem ir pra maquininha.
export const TERMINAL_PAYMENT_METHODS = ["DEBIT", "CREDIT", "PIX"];

// Forma de pagamento que o cliente usou de fato no aparelho. Se o MP não informar (ou vier um tipo
// que a gente não mapeia), vale a que o operador escolheu no PDV.
export function resolvePaymentMethod(paymentType, fallback) {
  const type = String(paymentType ?? "").toLowerCase();
  if (type === "credit_card") return "CREDIT";
  if (type === "debit_card" || type === "prepaid_card") return "DEBIT";
  if (type.includes("pix") || type === "qr") return "PIX";
  return fallback;
}
