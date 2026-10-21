import "server-only";
import { Environment, IntegrationApiKeys, IntegrationCommerceCodes, Options, WebpayPlus } from "transbank-sdk";
export { isAuthorizedWebpayResponse, sanitizeWebpayResponse } from "./webpayCore.mjs";

export class TransbankConfigurationError extends Error {
  constructor(message = "Transbank no está configurado.") { super(message); this.name = "TransbankConfigurationError"; }
}

function transactionFromEnvironment() {
  // Fail-closed: TRANSBANK_ENVIRONMENT debe declararse explícitamente. Un
  // valor ausente ya no cae en "integration" — si esta variable faltara en
  // producción, Webpay debe romperse de forma ruidosa (503), nunca aceptar
  // pagos de sandbox en silencio mostrando éxito al conductor.
  const environment = String(process.env.TRANSBANK_ENVIRONMENT || "").toLowerCase();
  if (!environment) throw new TransbankConfigurationError("TRANSBANK_ENVIRONMENT no está configurado.");
  if (environment === "integration") {
    const commerceCode = process.env.TRANSBANK_COMMERCE_CODE || IntegrationCommerceCodes.WEBPAY_PLUS;
    const apiKey = process.env.TRANSBANK_API_KEY || IntegrationApiKeys.WEBPAY;
    return new WebpayPlus.Transaction(new Options(commerceCode, apiKey, Environment.Integration));
  }
  if (environment !== "production") throw new TransbankConfigurationError("TRANSBANK_ENVIRONMENT inválido.");
  if (!process.env.TRANSBANK_COMMERCE_CODE || !process.env.TRANSBANK_API_KEY) throw new TransbankConfigurationError();
  return new WebpayPlus.Transaction(new Options(process.env.TRANSBANK_COMMERCE_CODE, process.env.TRANSBANK_API_KEY, Environment.Production));
}

export function createTransbankWebpayProvider(transaction = transactionFromEnvironment()) {
  return {
    createTransaction({ buyOrder, sessionId, amount, returnUrl }) { return transaction.create(buyOrder, sessionId, amount, returnUrl); },
    commitTransaction(token) { return transaction.commit(token); },
    getTransactionStatus(token) { return transaction.status(token); },
  };
}
