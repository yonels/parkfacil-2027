// Armado de facturas (33), notas de crédito (61) y notas de débito (56) para Haulmer OpenFactura
// (SOL-2026-11-05-005, F2; decisiones D6, D8 y D9). Código puro, sin red.
// Fuente: colección oficial de la API (docsapi-openfactura.haulmer.com, ejemplos «Factura Electrónica»,
// «Nota de Crédito» y «Nota de Débito», leída 2026-11-06): POST /v2/dte/document, nombres de campos del SII,
// Folio 0 (lo asigna OpenFactura), Referencia { NroLinRef, TpoDocRef, FolioRef, FchRef, CodRef }.
import { BillingProviderError } from "./BillingProviderAdapter.mjs";

export const DTE_TYPES = Object.freeze({ INVOICE: 33, CREDIT_NOTE: 61, DEBIT_NOTE: 56 });
export const HAULMER_BASE_URLS = Object.freeze({ TEST: "https://dev-api.haulmer.com", PRODUCTION: "https://api.haulmer.com" });

// Empresa de prueba publicada por Haulmer para su ambiente de desarrollo (sus claves públicas solo emiten con
// este emisor). Datos públicos de la documentación; la API Key NO va aquí (variable de entorno).
export const HAULMER_TEST_ISSUER = Object.freeze({
  RUTEmisor: "76795561-8",
  RznSoc: "HAULMER SPA",
  GiroEmis: "VENTA AL POR MENOR EN EMPRESAS DE VENTA A DISTANCIA VÍA INTERNET; COMERCIO ELEC",
  Acteco: 479100,
  DirOrigen: "ARTURO PRAT 527   CURICO",
  CmnaOrigen: "Curicó",
  CdgSIISucur: "81303347",
});

// CodRef del SII: 1 anula el documento de referencia, 3 corrige montos.
export const REFERENCE_CODES = Object.freeze({ VOID: "1", AMOUNT_CORRECTION: "3" });

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const cleanRut = (value) => String(value || "").replace(/\./g, "").trim().toUpperCase();

function fail(code, message) {
  throw new BillingProviderError(code, message);
}

export function issuerSection({ issuer = {}, environment }) {
  if (environment === "TEST") return { ...HAULMER_TEST_ISSUER };
  const missing = [["rut", "RUT"], ["businessName", "razón social"], ["businessActivity", "giro"], ["activityCode", "código de actividad"], ["address", "dirección"], ["district", "comuna"]]
    .filter(([key]) => !String(issuer[key] || "").trim()).map(([, label]) => label);
  if (missing.length) fail("ISSUER_DATA_MISSING", `Faltan datos del emisor para Haulmer: ${missing.join(", ")}.`);
  const section = { RUTEmisor: cleanRut(issuer.rut), RznSoc: text(issuer.businessName, 100), GiroEmis: text(issuer.businessActivity, 80), Acteco: Number(issuer.activityCode), DirOrigen: text(issuer.address, 70), CmnaOrigen: text(issuer.district, 20) };
  if (String(issuer.siiBranchCode || "").trim()) section.CdgSIISucur = String(issuer.siiBranchCode).trim();
  return section;
}

export function receiverSection(customer = {}) {
  const missing = [["rut", "RUT"], ["businessName", "razón social"], ["businessActivity", "giro"], ["address", "dirección"], ["district", "comuna"]]
    .filter(([key]) => !String(customer[key] || "").trim()).map(([, label]) => label);
  if (missing.length) fail("FISCAL_DATA_MISSING", `Faltan datos tributarios del cliente: ${missing.join(", ")}.`);
  const section = { RUTRecep: cleanRut(customer.rut), RznSocRecep: text(customer.businessName, 100), GiroRecep: text(customer.businessActivity, 40), DirRecep: text(customer.address, 70), CmnaRecep: text(customer.district, 20) };
  if (String(customer.city || "").trim()) section.CiudadRecep = text(customer.city, 20);
  return section;
}

// Detalle y totales en pesos enteros. Las líneas deben sumar el neto del documento (lo garantiza la base de datos).
export function detailAndTotals(lines, totals) {
  if (!Array.isArray(lines) || !lines.length) fail("DOCUMENT_LINES_REQUIRED", "El documento requiere líneas.");
  let taxable = 0;
  let exempt = 0;
  const detail = lines.map((line, index) => {
    if (line.taxCategory !== "TAXABLE" && line.taxCategory !== "EXEMPT") fail("TAX_CLASSIFICATION_REQUIRED", "Existen líneas sin clasificación tributaria.");
    const amount = Math.round(Number(line.total));
    if (!Number.isFinite(amount) || amount <= 0) fail("DOCUMENT_AMOUNT_INVALID", "Cada línea debe tener un monto mayor que cero.");
    const quantity = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
    const item = { NroLinDet: index + 1, NmbItem: text(line.description, 80) || "Servicio", QtyItem: quantity, PrcItem: Math.round((amount / quantity) * 1e6) / 1e6, MontoItem: amount };
    if (line.taxCategory === "EXEMPT") { item.IndExe = 1; exempt += amount; } else taxable += amount;
    return item;
  });
  const tax = Math.round(Number(totals?.tax ?? taxable * 0.19));
  const total = taxable + exempt + tax;
  if (totals?.total != null && Math.round(Number(totals.total)) !== total) fail("DOCUMENT_TOTALS_MISMATCH", `Los totales no cuadran con las líneas (${total} ≠ ${Math.round(Number(totals.total))}).`);
  const section = {};
  if (taxable) { section.MntNeto = taxable; section.TasaIVA = "19"; section.IVA = tax; }
  if (exempt) section.MntExe = exempt;
  section.MntTotal = total;
  return { Detalle: detail, Totales: section };
}

export function buildHaulmerDte(request, { environment }) {
  const tipo = DTE_TYPES[request?.documentType];
  if (!tipo) fail("DOCUMENT_TYPE_INVALID", "Tipo de documento no soportado por Haulmer.");
  if (request.currency !== "CLP") fail("DOCUMENT_CURRENCY_INVALID", "Haulmer solo recibe documentos en pesos.");
  const idDoc = { TipoDTE: tipo, Folio: 0, FchEmis: request.issueDate };
  if (tipo === 33) { idDoc.FmaPago = "2"; if (request.dueDate) idDoc.FchVenc = request.dueDate; }
  const { Detalle, Totales } = detailAndTotals(request.lines, request.totals);
  const dte = { Encabezado: { IdDoc: idDoc, Emisor: issuerSection({ issuer: request.issuer, environment }), Receptor: receiverSection(request.customer), Totales }, Detalle };
  if (tipo !== 33) {
    const ref = request.reference || {};
    if (!ref.folio || !ref.date) fail("REFERENCE_REQUIRED", "La nota requiere el folio y la fecha de la factura de origen.");
    dte.Referencia = [{ NroLinRef: 1, TpoDocRef: "33", FolioRef: String(ref.folio), FchRef: ref.date, CodRef: tipo === 61 && request.correctionMode === "TOTAL" ? REFERENCE_CODES.VOID : REFERENCE_CODES.AMOUNT_CORRECTION, RazonRef: text(request.reason, 90) || "Corrige montos" }];
  }
  // El correo al cliente lo envía ParkFacil (documentEmailService) con el PDF: no se pide sendEmail a Haulmer
  // para no duplicar envíos (y porque desde su ambiente de pruebas no llegó, 2026-11-06).
  return { response: ["FOLIO", "RESOLUCION"], dte };
}

// Destinatarios del correo del documento (mismo formato que sendEmail de OpenFactura: to, CC, BCC).
// En pruebas el documento va SOLO al correo del emisor: nunca a clientes reales con documentos de prueba.
export function emailRecipients(request, { environment }) {
  const issuer = request?.issuer || {};
  if (!issuer.sendEmailOnIssue || !String(issuer.email || "").trim()) return null;
  if (environment === "TEST") return { to: String(issuer.email).trim() };
  const to = String(request?.customer?.billingEmail || "").trim();
  if (!to) return null;
  const result = { to };
  if (String(issuer.emailCc || "").trim()) result.CC = String(issuer.emailCc).trim();
  result.BCC = String(issuer.email).trim();
  return result;
}
