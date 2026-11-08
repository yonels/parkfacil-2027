// Registro de DTE emitidos (SOL-2026-11-05-005, F2b; decisión D10). Código puro: lee la planilla de EasyDoc
// («Descarga Excel» de Documentos Emitidos) y los documentos de Haulmer (/v2/dte/document/issued) y los deja en un
// mismo formato. Formato EasyDoc verificado con la planilla del usuario del 2026-11-08 (29 columnas, todo texto).
import { isValidRut } from "./rutCore.mjs";

export const DTE_TYPE_LABELS = Object.freeze({
  33: "Factura electrónica", 34: "Factura exenta", 56: "Nota de débito", 61: "Nota de crédito",
});
export const DTE_SOURCES = Object.freeze({ EASYDOC: "EasyDoc", SII_RCV: "Registro de Ventas SII", HAULMER: "Haulmer", PARKFACIL: "ParkFacil" });
// Solo facturas y notas: las boletas y guías no forman parte de la facturación a clientes.
export const IMPORTABLE_DTE_TYPES = Object.freeze([33, 34, 56, 61]);
export const PARKFACIL_DOCUMENT_TYPES = Object.freeze({ INVOICE: 33, CREDIT_NOTE: 61, DEBIT_NOTE: 56 });

export class DteImportError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = "DteImportError";
    this.code = code;
    this.status = status;
  }
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export function normalizeRut(value) {
  const compact = String(value ?? "").replace(/[.\s]/g, "").toUpperCase();
  const match = /^(\d{1,9})-?([\dK])$/.exec(compact);
  return match ? `${Number(match[1])}-${match[2]}` : "";
}

function integer(value, field, errors, row) {
  const text = clean(value).replace(/\./g, "").replace(",", ".");
  if (text === "") return 0;
  const number = Number(text);
  if (!Number.isFinite(number)) { errors.push({ row, message: `${field} no es un número («${clean(value)}»).` }); return 0; }
  return Math.round(number);
}

// «01-11-2026 9:30:46», «01-11-2026», «2026-11-01» o fecha de Excel → «2026-11-01».
export function parseDocumentDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  let match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(text);
  if (match) {
    const [, d, m, y] = match;
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return isRealDate(iso) ? iso : "";
  }
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match && isRealDate(match[0]) ? match[0] : "";
}

function isRealDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}

const EASYDOC_REQUIRED = ["TIPODOC", "FOLIO_SII", "FECHAEMIS", "RZNSOCRECEP", "MNTONETO", "MNTOEXENTO", "IVA", "MNTOTOTAL", "RUTRECEP"];

// CSV «Descargar Detalles» de la pestaña VENTA del Registro de Compras y Ventas del SII (muestra del usuario,
// 2026-11-08: RCV_VENTA_<rut>_<AAAAMM>_<tipo>.csv, separador «;», 42 columnas, un archivo por tipo de documento).
const SII_REQUIRED = ["RUT CLIENTE", "RAZON SOCIAL", "FOLIO", "FECHA DOCTO", "MONTO EXENTO", "MONTO NETO", "MONTO IVA", "MONTO TOTAL"];

export function detectFormat(header = []) {
  const names = header.map((cell) => clean(cell).toUpperCase());
  if (EASYDOC_REQUIRED.every((name) => names.includes(name))) return "EASYDOC";
  if (SII_REQUIRED.every((name) => names.includes(name))) return "SII_RCV";
  return null;
}

// Tipo de documento del CSV del SII: viene en el nombre del archivo («…_202610_33.csv») o en una columna «Tipo Doc».
export function siiDteTypeFromFileName(fileName = "") {
  const match = /_(\d{2,3})\.(csv|txt)$/i.exec(String(fileName).trim());
  return match ? Number(match[1]) : null;
}

// Respuesta del cliente según el SII: acuse de recibo (como «Otorga Recibo» de EasyDoc), reclamo, o aceptación
// tácita a los 8 días de la recepción sin reclamo (Ley 19.983, art. 3).
export function siiCustomerResponse({ acuse, reclamo, recepcion }, today = new Date()) {
  if (parseDocumentDate(reclamo)) return "Reclamado";
  if (parseDocumentDate(acuse)) return "Otorga Recibo";
  const received = parseDocumentDate(recepcion);
  if (received && Date.parse(`${received}T00:00:00Z`) + 8 * 86400000 < today.getTime()) return "Aceptado x Omisión";
  return null;
}

export function parseSiiSalesRows(rows, { fileName = "", today = new Date() } = {}) {
  if (!Array.isArray(rows) || rows.length < 2) throw new DteImportError("DTE_FILE_EMPTY", "El archivo del SII no tiene documentos.");
  const header = rows[0].map((cell) => clean(cell).toUpperCase());
  if (detectFormat(header) !== "SII_RCV") throw new DteImportError("DTE_FORMAT_UNKNOWN", "No se reconoce el archivo: use «Descargar Detalles» de la pestaña VENTA del Registro de Compras y Ventas.");
  const col = Object.fromEntries(header.map((name, index) => [name, index]));
  const get = (row, name) => (col[name] === undefined ? "" : row[col[name]]);
  const typeColumn = ["TIPO DOC", "TIPO DOCTO", "TIPO DOCUMENTO"].find((name) => col[name] !== undefined);
  const fileType = siiDteTypeFromFileName(fileName);
  if (!typeColumn && !fileType) throw new DteImportError("DTE_TYPE_UNKNOWN", "No se sabe el tipo de documento: suba el archivo con el nombre que entrega el SII (termina en _33.csv, _61.csv o _56.csv).");
  const items = [];
  const errors = [];
  const skipped = [];
  const seen = new Set();
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (!Array.isArray(row) || row.every((cell) => clean(cell) === "")) return;
    const dteType = typeColumn ? Number(clean(get(row, typeColumn))) : fileType;
    if (!IMPORTABLE_DTE_TYPES.includes(dteType)) { skipped.push({ row: rowNumber, message: `Tipo ${dteType || "vacío"} no se importa (solo facturas y notas).` }); return; }
    const rowErrors = [];
    const folio = Number(clean(get(row, "FOLIO")));
    if (!Number.isInteger(folio) || folio <= 0) rowErrors.push({ row: rowNumber, message: "Folio vacío o inválido." });
    const issueDate = parseDocumentDate(get(row, "FECHA DOCTO"));
    if (!issueDate) rowErrors.push({ row: rowNumber, message: `Fecha del documento inválida («${clean(get(row, "FECHA DOCTO"))}»).` });
    const receiverRut = normalizeRut(get(row, "RUT CLIENTE"));
    if (!receiverRut || !isValidRut(receiverRut)) rowErrors.push({ row: rowNumber, message: `RUT del cliente inválido («${clean(get(row, "RUT CLIENTE"))}»).` });
    const net = integer(get(row, "MONTO NETO"), "Monto neto", rowErrors, rowNumber);
    const exempt = integer(get(row, "MONTO EXENTO"), "Monto exento", rowErrors, rowNumber);
    const tax = integer(get(row, "MONTO IVA"), "Monto IVA", rowErrors, rowNumber);
    const total = integer(get(row, "MONTO TOTAL"), "Monto total", rowErrors, rowNumber);
    const key = `${dteType}-${folio}`;
    if (!rowErrors.length && seen.has(key)) rowErrors.push({ row: rowNumber, message: `Documento repetido en el archivo (tipo ${dteType}, folio ${folio}).` });
    if (rowErrors.length) { errors.push(...rowErrors); return; }
    seen.add(key);
    const referenceType = Number(clean(get(row, "TIPO DOCTO. REFERENCIA")));
    const referenceFolio = Number(clean(get(row, "FOLIO DOCTO. REFERENCIA")));
    items.push({
      dteType, folio, issueDate, receiverRut, receiverName: clean(get(row, "RAZON SOCIAL")).slice(0, 200), net, exempt, tax, total,
      // Si aparece en el Registro de Ventas, el SII lo recibió y lo aceptó.
      voided: undefined, siiStatus: "Aceptado",
      customerResponse: siiCustomerResponse({ acuse: get(row, "FECHA ACUSE RECIBO"), reclamo: get(row, "FECHA RECLAMO"), recepcion: get(row, "FECHA RECEPCION") }, today),
      siiAction: null,
      referenceDteType: Number.isInteger(referenceType) && referenceType > 0 ? referenceType : null,
      referenceFolio: Number.isInteger(referenceFolio) && referenceFolio > 0 ? referenceFolio : null,
      trackId: null,
      raw: { tipoVenta: clean(get(row, "TIPO VENTA")) || null, fechaRecepcionSii: clean(get(row, "FECHA RECEPCION")) || null, fechaAcuse: clean(get(row, "FECHA ACUSE RECIBO")) || null, fechaReclamo: clean(get(row, "FECHA RECLAMO")) || null, numeroInterno: clean(get(row, "NUMERO INTERNO")) || null },
    });
  });
  return { format: "SII_RCV", items, errors, skipped, totalRows: rows.length - 1 };
}

// Lee cualquiera de los dos formatos reconocidos.
export function parseIssuedDocumentsFile(rows, options = {}) {
  const format = detectFormat(Array.isArray(rows?.[0]) ? rows[0] : []);
  if (format === "SII_RCV") return parseSiiSalesRows(rows, options);
  if (format === "EASYDOC") return parseEasyDocRows(rows);
  if (!Array.isArray(rows) || rows.length < 2) throw new DteImportError("DTE_FILE_EMPTY", "El archivo no tiene documentos.");
  throw new DteImportError("DTE_FORMAT_UNKNOWN", "No se reconoce el archivo: use «Descarga Excel» de EasyDoc o «Descargar Detalles» de la pestaña VENTA del Registro de Compras y Ventas del SII.");
}

// Texto de la respuesta del cliente como lo muestra EasyDoc. ESTADO_ACCIONSII: AXO aceptado por omisión,
// ERM otorga recibo de mercaderías, ACD acepta contenido, RCD reclamo al contenido, RFP/RFT reclamo por falta.
const SII_ACTIONS = Object.freeze({ AXO: "Aceptado x Omisión", ERM: "Otorga Recibo", ACD: "Acepta Contenido", RCD: "Reclamo al Contenido", RFP: "Reclamo Falta Parcial", RFT: "Reclamo Falta Total", NCA: "Recepción de NC (anula)" });

export function customerResponseLabel(response, action) {
  const text = clean(response);
  if (text) return text.replace(/Omision\b/, "Omisión");
  return SII_ACTIONS[clean(action).toUpperCase()] || "";
}

// rows: matriz (primera fila = encabezado). Devuelve documentos válidos, errores por fila y omitidos (otros tipos).
export function parseEasyDocRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) throw new DteImportError("DTE_FILE_EMPTY", "La planilla no tiene documentos.");
  const header = rows[0].map((cell) => clean(cell).toUpperCase());
  if (detectFormat(header) !== "EASYDOC") throw new DteImportError("DTE_FORMAT_UNKNOWN", "No se reconoce la planilla: use «Descarga Excel» de Documentos Emitidos de EasyDoc.");
  const col = Object.fromEntries(header.map((name, index) => [name, index]));
  const get = (row, name) => (col[name] === undefined ? "" : row[col[name]]);
  const items = [];
  const errors = [];
  const skipped = [];
  const seen = new Set();
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    if (!Array.isArray(row) || row.every((cell) => clean(cell) === "")) return;
    const dteType = Number(clean(get(row, "TIPODOC")));
    const folio = Number(clean(get(row, "FOLIO_SII")));
    if (!IMPORTABLE_DTE_TYPES.includes(dteType)) { skipped.push({ row: rowNumber, message: `Tipo ${clean(get(row, "TIPODOC")) || "vacío"} no se importa (solo facturas y notas).` }); return; }
    const rowErrors = [];
    if (!Number.isInteger(folio) || folio <= 0) rowErrors.push({ row: rowNumber, message: "Folio SII vacío o inválido." });
    const issueDate = parseDocumentDate(get(row, "FECHAEMIS"));
    if (!issueDate) rowErrors.push({ row: rowNumber, message: `Fecha de emisión inválida («${clean(get(row, "FECHAEMIS"))}»).` });
    const receiverRut = normalizeRut(get(row, "RUTRECEP"));
    if (!receiverRut || !isValidRut(receiverRut)) rowErrors.push({ row: rowNumber, message: `RUT del cliente inválido («${clean(get(row, "RUTRECEP"))}»).` });
    const net = integer(get(row, "MNTONETO"), "Monto neto", rowErrors, rowNumber);
    const exempt = integer(get(row, "MNTOEXENTO"), "Monto exento", rowErrors, rowNumber);
    const tax = integer(get(row, "IVA"), "IVA", rowErrors, rowNumber);
    const total = integer(get(row, "MNTOTOTAL"), "Monto total", rowErrors, rowNumber);
    if (!rowErrors.length && net + exempt + tax !== total) rowErrors.push({ row: rowNumber, message: `Neto + exento + IVA (${net + exempt + tax}) no coincide con el total (${total}).` });
    const key = `${dteType}-${folio}`;
    if (!rowErrors.length && seen.has(key)) rowErrors.push({ row: rowNumber, message: `Documento repetido en la planilla (tipo ${dteType}, folio ${folio}).` });
    if (rowErrors.length) { errors.push(...rowErrors); return; }
    seen.add(key);
    const referenceType = Number(clean(get(row, "TIPO_REFERENCIA")));
    const referenceFolio = Number(clean(get(row, "FOLIO_REFERENCIA")));
    items.push({
      dteType, folio, issueDate, receiverRut, receiverName: clean(get(row, "RZNSOCRECEP")).slice(0, 200),
      net, exempt, tax, total,
      voided: clean(get(row, "ANULADO")) === "1",
      siiStatus: clean(get(row, "ESTADODTE")) || null,
      customerResponse: customerResponseLabel(get(row, "ESTADODTECLIENTE"), get(row, "ESTADO_ACCIONSII")) || null,
      siiAction: clean(get(row, "ESTADO_ACCIONSII")) && clean(get(row, "ESTADO_ACCIONSII")) !== "0" ? clean(get(row, "ESTADO_ACCIONSII")) : null,
      referenceDteType: Number.isInteger(referenceType) && referenceType > 0 ? referenceType : null,
      referenceFolio: Number.isInteger(referenceFolio) && referenceFolio > 0 ? referenceFolio : null,
      trackId: clean(get(row, "TRACKID")) || null,
      // Sin correos ni glosas de envío (datos personales): solo identificadores técnicos de EasyDoc.
      raw: { folioInterno: clean(get(row, "FOLIO_INTERNO")) || null, codigoEnvio: clean(get(row, "CODIGOENVIO")) || null, detalleRespuestaSii: clean(get(row, "DETALLE_RESPUESTA_SII")) || null, motivoNota: clean(get(row, "MotivoNotaAplicada".toUpperCase())) || null },
    });
  });
  return { format: "EASYDOC", items, errors, skipped, totalRows: rows.length - 1 };
}

// Un documento de Haulmer /v2/dte/document/issued → mismo formato.
export function fromHaulmerIssued(doc) {
  const dteType = Number(doc?.TipoDTE);
  const folio = Number(doc?.Folio);
  const receiverRut = normalizeRut(`${doc?.RUTRecep ?? ""}-${doc?.DV ?? ""}`);
  const issueDate = parseDocumentDate(doc?.FchEmis);
  if (!IMPORTABLE_DTE_TYPES.includes(dteType) || !Number.isInteger(folio) || folio <= 0 || !receiverRut || !issueDate) return null;
  const amount = (value) => Math.round(Number(value) || 0);
  return {
    dteType, folio, issueDate, receiverRut, receiverName: clean(doc.RznSocRecep).slice(0, 200),
    net: amount(doc.MntNeto), exempt: amount(doc.MntExe), tax: amount(doc.IVA), total: amount(doc.MntTotal),
    voided: false, siiStatus: null, customerResponse: null, siiAction: null, referenceDteType: null, referenceFolio: null,
    // Respuesta real de dev-api (2026-11-08): el campo es «Token» (la documentación dice «token»).
    trackId: null, providerToken: doc.Token || doc.token ? String(doc.Token || doc.token) : null,
    raw: { fechaRecibido: doc.FechaRecibido || null, formaPago: doc.FmaPago || null },
  };
}

// Compara con lo ya registrado (mapa «tipo-folio» → fila) y separa nuevos, con cambios y sin cambios.
const COMPARED = [["issueDate", "issue_date"], ["receiverRut", "receiver_rut"], ["receiverName", "receiver_name"], ["net", "net_amount"], ["exempt", "exempt_amount"], ["tax", "tax_amount"], ["total", "total_amount"], ["voided", "voided"], ["siiStatus", "sii_status"], ["customerResponse", "customer_response"], ["siiAction", "sii_action"], ["referenceDteType", "reference_dte_type"], ["referenceFolio", "reference_folio"], ["trackId", "track_id"], ["providerToken", "provider_token"]];

export function planImport(items, existingByKey = new Map()) {
  const toInsert = [];
  const toUpdate = [];
  const unchanged = [];
  for (const item of items) {
    const existing = existingByKey.get(`${item.dteType}-${item.folio}`);
    if (!existing) { toInsert.push(item); continue; }
    // Una fuente sin dato (null/undefined) no borra lo que trajo otra fuente.
    const changes = COMPARED.filter(([key, column]) => item[key] !== undefined && item[key] !== null && String(item[key]) !== String(existing[column] ?? ""));
    if (changes.length) toUpdate.push({ item, id: existing.id, changed: changes.map(([key]) => key) });
    else unchanged.push(item);
  }
  return { toInsert, toUpdate, unchanged };
}

export function toRegistryRow(item, { issuerRut, source, companyId = null, batchId = null, actorId = null, billingDocumentId = null }) {
  return {
    issuer_rut: issuerRut, dte_type: item.dteType, folio: item.folio, issue_date: item.issueDate,
    receiver_rut: item.receiverRut, receiver_name: item.receiverName || "", company_id: companyId,
    net_amount: item.net, exempt_amount: item.exempt, tax_amount: item.tax, total_amount: item.total,
    voided: Boolean(item.voided), sii_status: item.siiStatus ?? null, customer_response: item.customerResponse ?? null,
    sii_action: item.siiAction ?? null, reference_dte_type: item.referenceDteType ?? null, reference_folio: item.referenceFolio ?? null,
    track_id: item.trackId ?? null, provider_token: item.providerToken ?? null, billing_document_id: billingDocumentId,
    source, last_source: source, import_batch_id: batchId, raw: item.raw || {}, created_by: actorId,
  };
}

// Solo los campos que trae la fuente (sin borrar los de otras fuentes).
export function toRegistryUpdate(item, { source, batchId = null, companyId, billingDocumentId }) {
  const update = { last_source: source, updated_at: new Date().toISOString() };
  for (const [key, column] of COMPARED) if (item[key] !== undefined && item[key] !== null) update[column] = item[key];
  if (batchId) update.import_batch_id = batchId;
  if (companyId) update.company_id = companyId;
  if (billingDocumentId) update.billing_document_id = billingDocumentId;
  return update;
}

// Fila del listado «Documentos emitidos» (registro o documento propio de ParkFacil).
export function listRowFromRegistry(row, companyName = null) {
  return {
    id: row.id, origin: "registry", source: row.source, dteType: row.dte_type, dteLabel: DTE_TYPE_LABELS[row.dte_type] || `Tipo ${row.dte_type}`,
    folio: Number(row.folio), issueDate: row.issue_date, receiverRut: row.receiver_rut, receiverName: row.receiver_name,
    companyId: row.company_id, companyName, net: Number(row.net_amount), exempt: Number(row.exempt_amount), tax: Number(row.tax_amount),
    total: Number(row.total_amount), voided: Boolean(row.voided), siiStatus: row.sii_status || "", customerResponse: row.customer_response || "",
    reference: row.reference_dte_type && row.reference_folio ? `${row.reference_dte_type} N° ${row.reference_folio}` : "",
    billingDocumentId: row.billing_document_id || null, providerToken: row.provider_token || null, updatedAt: row.updated_at,
  };
}

export function listRowFromBillingDocument(doc) {
  const snapshot = doc.customer_snapshot || {};
  return {
    id: doc.id, origin: "parkfacil", source: "PARKFACIL", dteType: PARKFACIL_DOCUMENT_TYPES[doc.document_type] || null,
    dteLabel: DTE_TYPE_LABELS[PARKFACIL_DOCUMENT_TYPES[doc.document_type]] || doc.document_type,
    folio: doc.folio ? Number(doc.folio) : null, issueDate: doc.invoice_date, receiverRut: normalizeRut(snapshot.rut) || String(snapshot.rut || ""),
    receiverName: snapshot.businessName || "", companyId: doc.company_id, companyName: snapshot.businessName || null,
    net: Number(doc.net_amount), exempt: 0, tax: Number(doc.tax_amount), total: Number(doc.total_amount), voided: false,
    siiStatus: doc.provider_status || doc.status, customerResponse: "", reference: "", billingDocumentId: doc.id,
    providerToken: doc.provider_document_id || null, updatedAt: doc.updated_at,
  };
}
