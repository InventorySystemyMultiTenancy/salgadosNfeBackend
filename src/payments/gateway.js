import * as mercadoPagoClient from "./mercadoPagoClient.js";
import * as sumUpClient from "./sumUpClient.js";

export function getPaymentClient(provider) {
  if (provider === "MERCADO_PAGO") {
    return mercadoPagoClient;
  }
  if (provider === "SUMUP") {
    return sumUpClient;
  }
  throw new Error("Maquininha não configurada. Configure um banco em Config. Pagamento.");
}
