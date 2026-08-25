import * as focusNFeClient from "./focusNFeClient.js";
import * as nfeioClient from "./nfeioClient.js";

export function getGatewayClient(provider) {
  if (provider === "FOCUS_NFE") {
    return focusNFeClient;
  }
  if (provider === "NFEIO") {
    return nfeioClient;
  }
  if (provider === "PLUGNOTAS") {
    throw new Error("Integração com a PlugNotas ainda não foi implementada.");
  }
  throw new Error("Gateway fiscal não configurado. Configure um provedor em Fiscal > Configurações.");
}
