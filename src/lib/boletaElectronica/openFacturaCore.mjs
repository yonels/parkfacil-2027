// Boleta electrónica vía Haulmer OpenFactura (SOL-2026-10-20-001). Reglas puras:
// URL por ambiente, armado de la boleta (TipoDTE 39) desde un pago del POS y
// lectura de la respuesta. Documentación leída el 2026-10-20 en
// https://docsapi-openfactura.haulmer.com/ :
// - POST {base}/v2/dte/document, cabecera `apikey` e `Idempotency-Key` (24 h:
//   un reenvío con la misma llave no emite dos veces);
// - nombres de campos del SII (sensibles a mayúsculas), Folio 0 (lo asigna
//   OpenFactura), `response` pide FOLIO/TIMBRE/PDF/RESOLUCION;
// - errores { error: { code: "OF-xx", message, details[] } }, 429 por límite
//   (3/s, 100/min), 401 por API Key inválida.
// Aún NO se emite desde el POS: falta conectar el pago en efectivo y los datos
// del emisor (giro, dirección, sucursal SII) en la configuración.

import { DTE_ENVIRONMENTS } from "./dteSettingsConstants.mjs";

export const OPENFACTURA_BASE_URLS = Object.freeze({
  [DTE_ENVIRONMENTS.TEST]: "https://dev-api.haulmer.com",
  [DTE_ENVIRONMENTS.PRODUCTION]: "https://api.haulmer.com",
});
export const OPENFACTURA_DOCUMENT_PATH = "/v2/dte/document";
export const BOLETA_AFECTA = 39;
// Boletas: receptor genérico del SII cuando no se identifica al cliente.
export const GENERIC_RECEIVER_RUT = "66666666-6";
// IndServicio 3: boleta de ventas y servicios.
export const IND_SERVICIO_VENTAS_Y_SERVICIOS = 3;
export const DEFAULT_RESPONSE_PARTS = Object.freeze(["FOLIO", "TIMBRE", "RESOLUCION"]);
const VAT_RATE = 0.19;

export class OpenFacturaError extends Error {
  constructor(code, message, { status = null, details = [], retryable = false } = {}) {
    super(message);
    this.name = "OpenFacturaError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryable = retryable;
  }
}

export function openFacturaDocumentUrl(environment) {
  const base = OPENFACTURA_BASE_URLS[environment];
  if (!base) throw new OpenFacturaError("DTE_ENVIRONMENT_INVALID", "Ambiente de boleta electrónica no válido.");
  return `${base}${OPENFACTURA_DOCUMENT_PATH}`;
}

// Fecha de emisión en hora de Chile (AAAA-MM-DD).
export function chileIssueDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Neto e IVA desde un total con IVA incluido (pesos enteros): neto + IVA = total.
export function splitGrossAmount(total) {
  const gross = Math.round(Number(total));
  if (!Number.isFinite(gross) || gross <= 0) throw new OpenFacturaError("DTE_AMOUNT_INVALID", "El monto de la boleta debe ser mayor que cero.");
  const net = Math.round(gross / (1 + VAT_RATE));
  return { net, vat: gross - net, total: gross };
}

const required = (value) => String(value ?? "").trim();

export function validateEmitter(emitter) {
  const missing = ["rut", "businessName", "activity", "address", "commune"].filter((key) => !required(emitter?.[key]));
  if (missing.length) throw new OpenFacturaError("DTE_EMITTER_INCOMPLETE", `Faltan datos del emisor: ${missing.join(", ")}.`);
  return emitter;
}

// Boleta afecta (39) por un cobro de estacionamiento con IVA incluido.
// emitter: { rut, businessName, activity, address, commune, city?, siiBranchCode? }
// sale: { total, description, issueDate? }
export function buildBoletaRequest({ emitter, sale, responseParts = DEFAULT_RESPONSE_PARTS }) {
  validateEmitter(emitter);
  const amounts = splitGrossAmount(sale?.total);
  const itemName = required(sale?.description).slice(0, 80) || "Servicio de estacionamiento";
  // Esquema de boleta del SII (QA OpenFactura dev 2026-10-20, OF-08): el emisor
  // usa RznSocEmisor/GiroEmisor y no lleva Acteco; el orden importa.
  const emisor = { RUTEmisor: required(emitter.rut), RznSocEmisor: required(emitter.businessName).slice(0, 100), GiroEmisor: required(emitter.activity).slice(0, 80) };
  if (required(emitter.siiBranchCode)) emisor.CdgSIISucur = required(emitter.siiBranchCode);
  emisor.DirOrigen = required(emitter.address).slice(0, 70);
  emisor.CmnaOrigen = required(emitter.commune).slice(0, 20);
  if (required(emitter.city)) emisor.CiudadOrigen = required(emitter.city).slice(0, 20);
  return {
    response: [...responseParts],
    dte: {
      Encabezado: {
        IdDoc: { TipoDTE: BOLETA_AFECTA, Folio: 0, FchEmis: sale?.issueDate || chileIssueDate(), IndServicio: IND_SERVICIO_VENTAS_Y_SERVICIOS },
        Emisor: emisor,
        Receptor: { RUTRecep: GENERIC_RECEIVER_RUT },
        Totales: { MntNeto: amounts.net, IVA: amounts.vat, MntTotal: amounts.total },
      },
      // En boletas el precio del detalle va con IVA incluido.
      Detalle: [{ NroLinDet: 1, NmbItem: itemName, QtyItem: 1, PrcItem: amounts.total, MontoItem: amounts.total }],
    },
  };
}

// Llave de idempotencia estable por pago: reintentar el mismo pago no emite dos boletas.
export function boletaIdempotencyKey(paymentCode) {
  const code = required(paymentCode);
  if (!/^[A-Za-z0-9-]{6,64}$/.test(code)) throw new OpenFacturaError("DTE_IDEMPOTENCY_INVALID", "Código de pago no válido para la boleta.");
  return `parkfacil-boleta-${code}`;
}

export function parseBoletaResponse(status, body) {
  if (status >= 200 && status < 300 && body?.TOKEN) {
    return {
      token: String(body.TOKEN),
      folio: Number.isInteger(body.FOLIO) ? body.FOLIO : Number(body.FOLIO) || null,
      resolution: body.RESOLUCION ? { date: body.RESOLUCION.fecha || null, number: body.RESOLUCION.numero ?? null } : null,
      stampPngBase64: typeof body.TIMBRE === "string" ? body.TIMBRE : null,
      xmlBase64: typeof body.XML === "string" ? body.XML : null,
      warning: body.WARNING || null,
      alreadyIssued: false,
    };
  }
  if (status === 401) throw new OpenFacturaError("DTE_API_KEY_REJECTED", "Haulmer rechazó la API Key.", { status });
  if (status === 429) throw new OpenFacturaError("DTE_RATE_LIMITED", "Haulmer limitó las solicitudes; reintentar en unos segundos.", { status, retryable: true });
  const error = body?.error || {};
  const code = String(error.code || `HTTP_${status}`);
  // OF-06 (probado en dev 2026-10-20): la misma Idempotency-Key ya emitió; Haulmer
  // devuelve el token original en details[{ field: "token" }]. No es un error:
  // la boleta existe (folio y timbre se recuperan por el token).
  if (code === "OF-06") {
    const token = (Array.isArray(error.details) ? error.details : []).find((item) => item?.field === "token")?.issue;
    if (token) return { token: String(token), folio: null, resolution: null, stampPngBase64: null, xmlBase64: null, warning: null, alreadyIssued: true };
  }
  // OF-06: la llave de idempotencia ya se usó (la boleta ya fue emitida).
  const retryable = status >= 500 || ["OF-13", "OF-21"].includes(code);
  throw new OpenFacturaError(code, String(error.message || "Haulmer no emitió la boleta."), { status, details: Array.isArray(error.details) ? error.details : [], retryable });
}

// TED (timbre electrónico) desde el XML que devuelve OpenFactura (base64,
// ISO-8859-1). La APK lo imprime como PDF417; se quitan los espacios entre
// etiquetas (el XML viene indentado), sin tocar el texto de cada campo.
export function extractTedFromXml(xmlBase64) {
  if (!xmlBase64) return null;
  const xml = Buffer.from(String(xmlBase64), "base64").toString("latin1");
  const ted = xml.match(/<TED[\s\S]*?<\/TED>/)?.[0];
  return ted ? ted.replace(/>\s+</g, "><").trim() : null;
}

// Leyenda del timbre en el comprobante: «Res. N° 80 de 2014».
export function resolutionText(resolution) {
  const year = String(resolution?.date || "").slice(0, 4);
  if (!/^\d{4}$/.test(year) || resolution?.number == null) return "";
  return `Res. N° ${resolution.number} de ${year}`;
}
