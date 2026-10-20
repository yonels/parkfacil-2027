// Emite UNA boleta de prueba en el ambiente de DESARROLLO de Haulmer OpenFactura
// (CAF simulado: el timbre no es válido ante el SII). SOL-2026-10-20-001.
//
// Uso: OPENFACTURA_TEST_API_KEY=<API Key pública de prueba> node scripts/local-openfactura-dev-boleta.mjs [monto] [codigoPago]
// La API Key y los datos del emisor de prueba son los publicados por Haulmer en
// https://docsapi-openfactura.haulmer.com/ (empresa de prueba "HAULMER SPA").
// No imprime la API Key ni el timbre completo.

import { writeFileSync } from "node:fs";
import { buildBoletaRequest } from "../src/lib/boletaElectronica/openFacturaCore.mjs";
import { emitBoleta } from "../src/lib/boletaElectronica/openFacturaClient.mjs";

const apiKey = process.env.OPENFACTURA_TEST_API_KEY || "";
if (!apiKey) {
  console.error("Falta OPENFACTURA_TEST_API_KEY.");
  process.exit(1);
}
const total = Number(process.argv[2] || 14735);
const paymentCode = process.argv[3] || `PAG-TEST-${Date.now()}`;

const emitter = {
  rut: "76795561-8",
  businessName: "HAULMER SPA",
  activity: "VENTA AL POR MENOR EN EMPRESAS DE VENTA A DISTANCIA VIA INTERNET",
  activityCode: 479100,
  address: "ARTURO PRAT 527   CURICO",
  commune: "Curicó",
  siiBranchCode: "81303347",
};

const request = buildBoletaRequest({ emitter, sale: { total, description: "Estacionamiento KJFF-59" } });
console.log("Solicitud:", JSON.stringify({ ...request.dte.Encabezado, Detalle: request.dte.Detalle }));
try {
  const result = await emitBoleta({ environment: "TEST", apiKey, request, paymentCode });
  if (process.env.OUT_STAMP && result.stampPngBase64) writeFileSync(process.env.OUT_STAMP, Buffer.from(result.stampPngBase64, "base64"));
  console.log(result.alreadyIssued ? "Ya emitida (Idempotency-Key):" : "Emitida:", JSON.stringify({ token: `${result.token.slice(0, 12)}…`, folio: result.folio, resolution: result.resolution, warning: result.warning, stampPngBytes: result.stampPngBase64 ? Buffer.from(result.stampPngBase64, "base64").length : 0 }));
} catch (error) {
  console.error("Error:", JSON.stringify({ code: error.code, status: error.status, message: error.message, details: error.details, retryable: error.retryable }));
  process.exit(2);
}
