import "server-only";
import { DteImportError, listRowFromBillingDocument, listRowFromRegistry, normalizeRut, planImport, toRegistryRow, toRegistryUpdate } from "./dteRegistryCore.mjs";
import { readSettingsRow } from "./settingsRepository";
import { HAULMER_TEST_ISSUER } from "./providers/haulmerDteCore.mjs";

// Registro de DTE emitidos (SOL-2026-11-05-005, F2b). Usa el cliente de servicio; las rutas validan permisos.
const REGISTRY_COLUMNS = "id,issuer_rut,dte_type,folio,issue_date,receiver_rut,receiver_name,company_id,net_amount,exempt_amount,tax_amount,total_amount,voided,sii_status,customer_response,sii_action,reference_dte_type,reference_folio,track_id,provider_token,billing_document_id,source,last_source,updated_at";
const CHUNK = 200;

function fail(error, message) {
  if (!error) return;
  const wrapped = new Error(`${message}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

const chunks = (list, size = CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// RUT del emisor según la fuente: lo emitido con EasyDoc o el SII es de ParkFacil; en el ambiente de pruebas de
// Haulmer los documentos salen a nombre de su empresa de prueba (D9).
export async function issuerRutFor(db, source) {
  const settings = await readSettingsRow(db);
  if (source === "HAULMER" && settings.provider_environment !== "PRODUCTION") return HAULMER_TEST_ISSUER.RUTEmisor;
  const rut = normalizeRut(`${settings.issuer_rut_number || ""}-${settings.issuer_rut_dv || ""}`);
  if (!rut) throw new DteImportError("ISSUER_DATA_MISSING", "Falta el RUT del emisor en Facturación → Configuración.");
  return rut;
}

export async function companiesByRut(db) {
  const result = await db.from("companies").select("id,business_name,rut_number,rut_dv");
  fail(result.error, "No fue posible leer las empresas");
  const map = new Map();
  for (const company of result.data || []) {
    const rut = normalizeRut(`${company.rut_number || ""}-${company.rut_dv || ""}`);
    if (rut && !map.has(rut)) map.set(rut, { id: company.id, name: company.business_name });
  }
  return map;
}

async function existingByKey(db, issuerRut, items) {
  const map = new Map();
  for (const type of [...new Set(items.map((item) => item.dteType))]) {
    const folios = items.filter((item) => item.dteType === type).map((item) => item.folio);
    for (const part of chunks(folios)) {
      const result = await db.from("billing_dte_registry").select(REGISTRY_COLUMNS).eq("issuer_rut", issuerRut).eq("dte_type", type).in("folio", part);
      fail(result.error, "No fue posible revisar los documentos ya registrados");
      for (const row of result.data || []) map.set(`${row.dte_type}-${row.folio}`, row);
    }
  }
  return map;
}

// Documentos propios emitidos por Haulmer: se enlazan por el token del proveedor.
async function billingDocumentsByToken(db, tokens) {
  const map = new Map();
  for (const part of chunks(tokens.filter(Boolean))) {
    const result = await db.from("billing_documents").select("id,provider_document_id,company_id").in("provider_document_id", part);
    fail(result.error, "No fue posible revisar los documentos emitidos por ParkFacil");
    for (const row of result.data || []) map.set(row.provider_document_id, row);
  }
  return map;
}

// Vista previa (commit = false) o aplicación (commit = true) de una carga. Nunca duplica: emisor + tipo + folio.
export async function applyDteImport(db, { source, items, errors = [], skipped = [], totalRows = items.length, fileName = null, period = {}, actorId = null, commit = false }) {
  const issuerRut = await issuerRutFor(db, source);
  const companies = await companiesByRut(db);
  const existing = await existingByKey(db, issuerRut, items);
  const ownDocuments = source === "HAULMER" ? await billingDocumentsByToken(db, items.map((item) => item.providerToken)) : new Map();
  const plan = planImport(items, existing);
  const unmatched = new Map();
  for (const item of items) if (!companies.has(item.receiverRut)) unmatched.set(item.receiverRut, item.receiverName);
  const summary = {
    source, issuerRut, totalRows, valid: items.length, inserted: plan.toInsert.length, updated: plan.toUpdate.length,
    unchanged: plan.unchanged.length, skipped: skipped.length, errors, skippedRows: skipped,
    matchedCompanies: items.filter((item) => companies.has(item.receiverRut)).length,
    unmatchedReceivers: [...unmatched].map(([rut, name]) => ({ rut, name })).slice(0, 200),
    byType: items.reduce((acc, item) => ({ ...acc, [item.dteType]: (acc[item.dteType] || 0) + 1 }), {}),
    sample: plan.toInsert.slice(0, 10).concat(plan.toUpdate.slice(0, 5).map((entry) => entry.item)),
    committed: false,
  };
  if (!commit) return summary;

  const batch = await db.from("billing_dte_imports").insert({
    source, file_name: fileName, period_from: period.from || null, period_to: period.to || null, total_rows: totalRows,
    inserted: plan.toInsert.length, updated: plan.toUpdate.length, skipped: skipped.length + errors.length,
    errors: errors.slice(0, 200), created_by: actorId,
  }).select("id").single();
  fail(batch.error, "No fue posible registrar la carga");
  const batchId = batch.data.id;
  const linkFor = (item) => ownDocuments.get(item.providerToken) || null;
  for (const part of chunks(plan.toInsert)) {
    const rows = part.map((item) => toRegistryRow(item, { issuerRut, source, companyId: companies.get(item.receiverRut)?.id || null, batchId, actorId, billingDocumentId: linkFor(item)?.id || null }));
    const result = await db.from("billing_dte_registry").insert(rows);
    fail(result.error, "No fue posible guardar los documentos nuevos");
  }
  for (const { item, id } of plan.toUpdate) {
    const update = toRegistryUpdate(item, { source, batchId, companyId: companies.get(item.receiverRut)?.id || null, billingDocumentId: linkFor(item)?.id || null });
    const result = await db.from("billing_dte_registry").update(update).eq("id", id);
    fail(result.error, "No fue posible actualizar los documentos ya registrados");
  }
  return { ...summary, committed: true, batchId };
}

export async function recordFailedImport(db, { source, fileName = null, message, actorId = null }) {
  await db.from("billing_dte_imports").insert({ source, file_name: fileName, status: "FAILED", message: String(message || "").slice(0, 500), created_by: actorId });
}

// Listado «Documentos emitidos»: registro (EasyDoc, SII, Haulmer) + lo emitido por ParkFacil que aún no está en el
// registro. Filtros como EasyDoc: tipo, folio, RUT, razón social, fechas, respuesta del cliente, origen.
export async function listIssuedDocuments(db, filters = {}) {
  let query = db.from("billing_dte_registry").select(REGISTRY_COLUMNS).order("issue_date", { ascending: false }).order("folio", { ascending: false }).limit(2000);
  if (filters.dteType) query = query.eq("dte_type", Number(filters.dteType));
  if (filters.folio) query = query.eq("folio", Number(filters.folio));
  if (filters.rut) query = query.eq("receiver_rut", normalizeRut(filters.rut) || filters.rut);
  if (filters.name) query = query.ilike("receiver_name", `%${String(filters.name).replace(/[%_]/g, "")}%`);
  if (filters.from) query = query.gte("issue_date", filters.from);
  if (filters.to) query = query.lte("issue_date", filters.to);
  if (filters.source && filters.source !== "PARKFACIL") query = query.eq("source", filters.source);
  const registry = filters.source === "PARKFACIL" ? { data: [] } : await query;
  fail(registry.error, "No fue posible listar los documentos emitidos");
  const companyIds = [...new Set((registry.data || []).map((row) => row.company_id).filter(Boolean))];
  const names = new Map();
  for (const part of chunks(companyIds)) {
    const result = await db.from("companies").select("id,business_name").in("id", part);
    fail(result.error, "No fue posible leer las empresas");
    for (const company of result.data || []) names.set(company.id, company.business_name);
  }
  const rows = (registry.data || []).map((row) => listRowFromRegistry(row, names.get(row.company_id) || null));

  if (!filters.source || filters.source === "PARKFACIL") {
    const linked = new Set(rows.map((row) => row.billingDocumentId).filter(Boolean));
    let own = db.from("billing_documents").select("id,company_id,document_type,folio,invoice_date,net_amount,tax_amount,total_amount,status,provider_status,provider_document_id,customer_snapshot,updated_at").not("folio", "is", null).neq("provider", "mock").order("invoice_date", { ascending: false }).limit(1000);
    if (filters.from) own = own.gte("invoice_date", filters.from);
    if (filters.to) own = own.lte("invoice_date", filters.to);
    if (filters.folio) own = own.eq("folio", String(filters.folio));
    const result = await own;
    fail(result.error, "No fue posible listar los documentos emitidos por ParkFacil");
    for (const doc of result.data || []) {
      if (linked.has(doc.id)) continue;
      const row = listRowFromBillingDocument(doc);
      if (filters.dteType && row.dteType !== Number(filters.dteType)) continue;
      if (filters.rut && row.receiverRut !== (normalizeRut(filters.rut) || filters.rut)) continue;
      if (filters.name && !row.receiverName.toLowerCase().includes(String(filters.name).toLowerCase())) continue;
      rows.push(row);
    }
  }
  const response = String(filters.response || "");
  const filtered = response ? rows.filter((row) => (response === "SIN_RESPUESTA" ? !row.customerResponse : row.customerResponse === response)) : rows;
  filtered.sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || (b.folio || 0) - (a.folio || 0));
  return filtered;
}

export async function listImports(db, limit = 20) {
  const result = await db.from("billing_dte_imports").select("id,source,file_name,period_from,period_to,status,total_rows,inserted,updated,skipped,message,created_at").order("created_at", { ascending: false }).limit(limit);
  fail(result.error, "No fue posible leer el historial de cargas");
  return result.data || [];
}

// RUT de las empresas cliente (para la sincronización en el ambiente de pruebas de Haulmer, donde la empresa de
// prueba es compartida por todos los integradores y no se deben traer documentos ajenos).
export async function clientReceiverRuts(db) {
  const result = await db.from("companies").select("rut_number,rut_dv").eq("relationship_type", "client");
  fail(result.error, "No fue posible leer las empresas cliente");
  return [...new Set((result.data || []).map((c) => normalizeRut(`${c.rut_number || ""}-${c.rut_dv || ""}`)).filter(Boolean))];
}
