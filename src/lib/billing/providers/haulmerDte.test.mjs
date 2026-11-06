import test from "node:test";
import assert from "node:assert/strict";
import { buildHaulmerDte, HAULMER_TEST_ISSUER } from "./haulmerDteCore.mjs";
import { HaulmerBillingProviderAdapter } from "./HaulmerBillingProviderAdapter.mjs";

const customer = { rut: "76.430.498-5", businessName: "HOSTY SPA", businessActivity: "EMPRESAS DE SERVICIOS INTEGRALES DE INFORMATICA", address: "ARTURO PRAT 527 3 pis OF 1", district: "Curicó" };
const issuer = { rut: "77991619-7", businessName: "ParkFacil SpA", businessActivity: "Otras actividades de tecnología", activityCode: "620900", address: "Av. Raúl Labbé 12613, Of. 231", district: "Lo Barnechea" };
const invoice = { idempotencyKey: "inv-1", documentType: "INVOICE", issueDate: "2026-11-06", dueDate: "2026-11-12", currency: "CLP", issuer, customer, lines: [{ description: "Parkfacil servicios de software", quantity: 1, total: 64491, taxCategory: "TAXABLE" }], totals: { net: 64491, tax: 12253, total: 76744 } };

test("factura 33 con la estructura del ejemplo oficial de OpenFactura", () => {
  const { response, dte } = buildHaulmerDte(invoice, { environment: "PRODUCTION" });
  assert.deepEqual(response, ["FOLIO", "RESOLUCION"]);
  assert.deepEqual(dte.Encabezado.IdDoc, { TipoDTE: 33, Folio: 0, FchEmis: "2026-11-06", FmaPago: "2", FchVenc: "2026-11-12" });
  assert.equal(dte.Encabezado.Emisor.RUTEmisor, "77991619-7");
  assert.equal(dte.Encabezado.Emisor.Acteco, 620900);
  assert.equal(dte.Encabezado.Receptor.RUTRecep, "76430498-5");
  assert.deepEqual(dte.Encabezado.Totales, { MntNeto: 64491, TasaIVA: "19", IVA: 12253, MntTotal: 76744 });
  assert.deepEqual(dte.Detalle, [{ NroLinDet: 1, NmbItem: "Parkfacil servicios de software", QtyItem: 1, PrcItem: 64491, MontoItem: 64491 }]);
  assert.equal(dte.Referencia, undefined);
});

test("en ambiente de pruebas el emisor es la empresa de prueba de Haulmer (D9)", () => {
  const { dte } = buildHaulmerDte(invoice, { environment: "TEST" });
  assert.deepEqual(dte.Encabezado.Emisor, { ...HAULMER_TEST_ISSUER });
});

test("nota de crédito total anula (CodRef 1) y parcial corrige montos (CodRef 3)", () => {
  const base = { ...invoice, idempotencyKey: "nc-1", documentType: "CREDIT_NOTE", reason: "Prueba", reference: { folio: "3130", date: "2026-11-06" }, lines: [{ description: "Ajuste", quantity: 1, total: 8403, taxCategory: "TAXABLE" }], totals: { net: 8403, tax: 1597, total: 10000 } };
  const partial = buildHaulmerDte({ ...base, correctionMode: "PARTIAL" }, { environment: "TEST" }).dte;
  assert.equal(partial.Encabezado.IdDoc.TipoDTE, 61);
  assert.equal(partial.Encabezado.IdDoc.FchVenc, undefined);
  assert.deepEqual(partial.Referencia, [{ NroLinRef: 1, TpoDocRef: "33", FolioRef: "3130", FchRef: "2026-11-06", CodRef: "3", RazonRef: "Prueba" }]);
  assert.equal(buildHaulmerDte({ ...base, correctionMode: "TOTAL" }, { environment: "TEST" }).dte.Referencia[0].CodRef, "1");
  assert.equal(buildHaulmerDte({ ...base, documentType: "DEBIT_NOTE" }, { environment: "TEST" }).dte.Encabezado.IdDoc.TipoDTE, 56);
});

test("exento con IndExe y validaciones que evitan enviar documentos inválidos", () => {
  const exempt = buildHaulmerDte({ ...invoice, lines: [{ description: "Exento", quantity: 1, total: 1000, taxCategory: "EXEMPT" }], totals: { net: 1000, tax: 0, total: 1000 } }, { environment: "TEST" }).dte;
  assert.deepEqual(exempt.Encabezado.Totales, { MntExe: 1000, MntTotal: 1000 });
  assert.equal(exempt.Detalle[0].IndExe, 1);
  assert.throws(() => buildHaulmerDte({ ...invoice, currency: "UF" }, { environment: "TEST" }), (e) => e.code === "DOCUMENT_CURRENCY_INVALID");
  assert.throws(() => buildHaulmerDte({ ...invoice, totals: { net: 64491, tax: 12253, total: 76745 } }, { environment: "TEST" }), (e) => e.code === "DOCUMENT_TOTALS_MISMATCH");
  assert.throws(() => buildHaulmerDte({ ...invoice, customer: { ...customer, address: "" } }, { environment: "TEST" }), (e) => e.code === "FISCAL_DATA_MISSING");
  assert.throws(() => buildHaulmerDte({ ...invoice, documentType: "CREDIT_NOTE", reference: {} }, { environment: "TEST" }), (e) => e.code === "REFERENCE_REQUIRED");
  assert.throws(() => buildHaulmerDte(invoice, { environment: "PRODUCTION", issuer: undefined }) && buildHaulmerDte({ ...invoice, issuer: { ...issuer, activityCode: "" } }, { environment: "PRODUCTION" }), (e) => e.code === "ISSUER_DATA_MISSING");
});

const fakeFetch = (status, body, calls = []) => async (url, options) => { calls.push({ url, options }); return { status, json: async () => body }; };

test("adaptador: emite con apikey e Idempotency-Key y devuelve token y folio", async () => {
  const calls = [];
  const adapter = new HaulmerBillingProviderAdapter({ environment: "TEST", apiKey: "clave-prueba", fetchImpl: fakeFetch(200, { TOKEN: "abc123def4567890", FOLIO: 3130 }, calls) });
  const result = await adapter.emitInvoice(invoice);
  assert.equal(calls[0].url, "https://dev-api.haulmer.com/v2/dte/document");
  assert.equal(calls[0].options.headers.apikey, "clave-prueba");
  assert.equal(calls[0].options.headers["Idempotency-Key"], "parkfacil-inv-1");
  assert.deepEqual([result.result, result.providerDocumentId, result.folio, result.providerStatus], ["ISSUED", "abc123def4567890", "3130", "EMITIDO_PRUEBA"]);
});

test("adaptador: rechazo de negocio (OF-xx) queda como REJECTED; 401 y 429 no", async () => {
  const rejected = await new HaulmerBillingProviderAdapter({ apiKey: "k", fetchImpl: fakeFetch(400, { error: { code: "OF-10", message: "Error de validación", details: [{ field: "RUTRecep", issue: "inválido" }] } }) }).emitInvoice(invoice);
  assert.equal(rejected.result, "REJECTED");
  assert.match(rejected.message, /RUTRecep inválido/);
  await assert.rejects(() => new HaulmerBillingProviderAdapter({ apiKey: "k", fetchImpl: fakeFetch(401, {}) }).emitInvoice(invoice), (e) => e.code === "DTE_API_KEY_REJECTED" && !e.retryable);
  await assert.rejects(() => new HaulmerBillingProviderAdapter({ apiKey: "k", fetchImpl: fakeFetch(429, {}) }).emitInvoice(invoice), (e) => e.retryable === true);
  await assert.rejects(() => new HaulmerBillingProviderAdapter({ apiKey: "", fetchImpl: fakeFetch(200, {}) }).emitInvoice(invoice), (e) => e.code === "PROVIDER_API_KEY_MISSING");
});

test("adaptador: OF-06 (ya emitido con la misma llave) se trata como duplicado con su token", async () => {
  const result = await new HaulmerBillingProviderAdapter({ apiKey: "k", fetchImpl: fakeFetch(400, { error: { code: "OF-06", message: "ya emitido", details: [{ field: "token", issue: "abcdef0123456789" }] } }) }).emitInvoice(invoice);
  assert.deepEqual([result.result, result.providerDocumentId], ["DUPLICATE", "abcdef0123456789"]);
});

test("adaptador: estado SII viene en «estado» (respuesta real de dev-api)", async () => {
  const adapter = new HaulmerBillingProviderAdapter({ apiKey: "k", fetchImpl: fakeFetch(200, { estado: "Aceptado", token: "abcdef0123456789" }) });
  assert.equal(await adapter.getDocumentStatus("abcdef0123456789"), "Aceptado");
});

test("adaptador: el PDF recién emitido se reintenta si Haulmer responde 500 mientras lo genera", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return calls < 3 ? { status: 500, json: async () => ({}) } : { status: 200, json: async () => ({ pdf: "JVBERi0=" }) }; };
  const body = await new HaulmerBillingProviderAdapter({ apiKey: "k", fetchImpl, retryDelayMs: 1 }).getDocument("abcdef0123456789", "pdf");
  assert.equal(body.pdf, "JVBERi0=");
  assert.equal(calls, 3);
});
