import assert from "node:assert/strict";
import test from "node:test";
import {
  boletaIdempotencyKey,
  buildBoletaRequest,
  chileIssueDate,
  openFacturaDocumentUrl,
  parseBoletaResponse,
  splitGrossAmount,
} from "./openFacturaCore.mjs";
import { emitBoleta } from "./openFacturaClient.mjs";

// Boleta electrónica vía OpenFactura (SOL-2026-10-20-001). Payload validado contra
// el ambiente de desarrollo de Haulmer el 2026-10-20 (folios 711226 y 711228).
const emitter = { rut: "76795561-8", businessName: "HAULMER SPA", activity: "VENTA AL POR MENOR", address: "ARTURO PRAT 527", commune: "Curicó", siiBranchCode: "81303347" };

test("OpenFactura: URL por ambiente (desarrollo y producción)", () => {
  assert.equal(openFacturaDocumentUrl("TEST"), "https://dev-api.haulmer.com/v2/dte/document");
  assert.equal(openFacturaDocumentUrl("PRODUCTION"), "https://api.haulmer.com/v2/dte/document");
  assert.throws(() => openFacturaDocumentUrl("OTRO"), { code: "DTE_ENVIRONMENT_INVALID" });
});

test("OpenFactura: neto + IVA = total con IVA incluido", () => {
  assert.deepEqual(splitGrossAmount(14735), { net: 12382, vat: 2353, total: 14735 });
  assert.deepEqual(splitGrossAmount(1000), { net: 840, vat: 160, total: 1000 });
  assert.throws(() => splitGrossAmount(0), { code: "DTE_AMOUNT_INVALID" });
});

test("OpenFactura: boleta 39 con el esquema de boleta del SII (RznSocEmisor/GiroEmisor, sin Acteco)", () => {
  const request = buildBoletaRequest({ emitter, sale: { total: 14735, description: "Estacionamiento KJFF-59", issueDate: "2026-10-20" } });
  assert.deepEqual(request.response, ["FOLIO", "TIMBRE", "RESOLUCION"]);
  const header = request.dte.Encabezado;
  assert.deepEqual(header.IdDoc, { TipoDTE: 39, Folio: 0, FchEmis: "2026-10-20", IndServicio: 3 });
  assert.deepEqual(Object.keys(header.Emisor), ["RUTEmisor", "RznSocEmisor", "GiroEmisor", "CdgSIISucur", "DirOrigen", "CmnaOrigen"]);
  assert.equal("Acteco" in header.Emisor, false);
  assert.deepEqual(header.Receptor, { RUTRecep: "66666666-6" });
  assert.deepEqual(header.Totales, { MntNeto: 12382, IVA: 2353, MntTotal: 14735 });
  assert.deepEqual(request.dte.Detalle, [{ NroLinDet: 1, NmbItem: "Estacionamiento KJFF-59", QtyItem: 1, PrcItem: 14735, MontoItem: 14735 }]);
  assert.throws(() => buildBoletaRequest({ emitter: { ...emitter, activity: "" }, sale: { total: 1000 } }), { code: "DTE_EMITTER_INCOMPLETE" });
  assert.match(chileIssueDate(new Date("2026-10-21T02:00:00Z")), /^2026-10-20$/, "hora de Chile");
});

test("OpenFactura: idempotencia estable por código de pago", () => {
  assert.equal(boletaIdempotencyKey("PAG-261020124629-E0A6"), "parkfacil-boleta-PAG-261020124629-E0A6");
  assert.throws(() => boletaIdempotencyKey("a b"), { code: "DTE_IDEMPOTENCY_INVALID" });
});

test("OpenFactura: respuesta exitosa, ya emitida (OF-06) y errores", () => {
  const ok = parseBoletaResponse(200, { TOKEN: "tok", FOLIO: 711226, RESOLUCION: { fecha: "2022-09-07", numero: 0 }, TIMBRE: "iVBOR", WARNING: [{ RznSocEmisor: "x" }] });
  assert.deepEqual(ok, { token: "tok", folio: 711226, resolution: { date: "2022-09-07", number: 0 }, stampPngBase64: "iVBOR", xmlBase64: null, warning: [{ RznSocEmisor: "x" }], alreadyIssued: false });
  // Respuesta real de dev al reenviar la misma Idempotency-Key.
  const again = parseBoletaResponse(400, { error: { code: "OF-06", message: "Este DTE ya fue emitido (Idempotency-Key)", details: [{ field: "token", issue: "c16f" }] } });
  assert.equal(again.alreadyIssued, true);
  assert.equal(again.token, "c16f");
  assert.throws(() => parseBoletaResponse(400, { error: { code: "OF-08", message: "Validación de Esquema", details: [{ field: "RznSoc", issue: "no esperado" }] } }), (error) => error.code === "OF-08" && error.details.length === 1 && !error.retryable);
  assert.throws(() => parseBoletaResponse(401, {}), { code: "DTE_API_KEY_REJECTED" });
  assert.throws(() => parseBoletaResponse(429, {}), (error) => error.code === "DTE_RATE_LIMITED" && error.retryable);
  assert.throws(() => parseBoletaResponse(503, null), (error) => error.retryable);
});

test("OpenFactura: el cliente envía apikey e Idempotency-Key y no emite sin API Key", async () => {
  let captured;
  const fetchImpl = async (url, options) => { captured = { url, options }; return { status: 200, json: async () => ({ TOKEN: "t", FOLIO: 1 }) }; };
  const request = buildBoletaRequest({ emitter, sale: { total: 1000, issueDate: "2026-10-20" } });
  const result = await emitBoleta({ environment: "TEST", apiKey: "clave-de-prueba-123456", request, paymentCode: "PAG-1-ABCD", fetchImpl });
  assert.equal(result.folio, 1);
  assert.equal(captured.url, "https://dev-api.haulmer.com/v2/dte/document");
  assert.equal(captured.options.headers.apikey, "clave-de-prueba-123456");
  assert.equal(captured.options.headers["Idempotency-Key"], "parkfacil-boleta-PAG-1-ABCD");
  assert.deepEqual(JSON.parse(captured.options.body), request);
  await assert.rejects(emitBoleta({ environment: "TEST", apiKey: "", request, paymentCode: "PAG-1-ABCD", fetchImpl }), { code: "DTE_API_KEY_MISSING" });
  await assert.rejects(emitBoleta({ environment: "TEST", apiKey: "k", request, paymentCode: "PAG-1-ABCD", fetchImpl: async () => { throw new TypeError("fail"); } }), (error) => error.code === "DTE_NETWORK" && error.retryable);
});
