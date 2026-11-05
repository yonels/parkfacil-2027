import "server-only";
import { CatalogValidationError, catalogAuditAction, fromCatalogRow, toCatalogRow } from "./catalogCore.mjs";

// Catálogo de servicios y productos (SOL-2026-11-05-005, F1.1). Usa el cliente de servicio
// (las rutas ya validaron permisos de Root antes de llegar aquí).
const COLUMNS = "id,code,name,description,item_kind,category,unit,tax_category,periodicity,reference_currency,reference_price,status,updated_at";

function fail(error, message) {
  if (!error) return;
  if (error.code === "23505") throw new CatalogValidationError("CATALOG_CODE_DUPLICATE", "Ya existe un servicio o producto con ese código.", "code");
  const wrapped = new Error(`${message}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

async function usageByConcept(db, ids) {
  const usage = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return usage;
  for (const table of ["contract_billable_items", "billing_preinvoice_lines", "billing_preinvoice_adjustments"]) {
    const result = await db.from(table).select("concept_id").in("concept_id", ids);
    fail(result.error, "No fue posible revisar el uso del catálogo");
    for (const row of result.data || []) usage.set(row.concept_id, (usage.get(row.concept_id) || 0) + 1);
  }
  return usage;
}

async function audit(db, { conceptId, action, actorId, previous, next }) {
  const result = await db.from("billable_concepts_audit").insert({ concept_id: conceptId, action, actor_id: actorId || null, previous_value: previous || null, new_value: next || null });
  fail(result.error, "No fue posible registrar la auditoría del catálogo");
}

export async function listCatalog(db) {
  const result = await db.from("billable_concepts").select(COLUMNS).order("status").order("name");
  fail(result.error, "No fue posible listar el catálogo");
  const rows = result.data || [];
  const usage = await usageByConcept(db, rows.map((row) => row.id));
  return rows.map((row) => fromCatalogRow({ ...row, usage_count: usage.get(row.id) || 0 }));
}

async function getRow(db, id) {
  const result = await db.from("billable_concepts").select(COLUMNS).eq("id", id).maybeSingle();
  fail(result.error, "No fue posible leer el servicio o producto");
  if (!result.data) throw Object.assign(new CatalogValidationError("CATALOG_NOT_FOUND", "El servicio o producto no existe."), { status: 404 });
  return result.data;
}

export async function createCatalogItem(db, values, actorId) {
  const row = { ...toCatalogRow(values, actorId), created_by: actorId || null };
  const result = await db.from("billable_concepts").insert(row).select(COLUMNS).single();
  fail(result.error, "No fue posible crear el servicio o producto");
  await audit(db, { conceptId: result.data.id, action: "CREATED", actorId, next: result.data });
  return fromCatalogRow(result.data);
}

export async function updateCatalogItem(db, id, values, actorId) {
  const previous = await getRow(db, id);
  if (values.code && values.code !== previous.code) {
    const usage = await usageByConcept(db, [id]);
    if (usage.get(id)) throw new CatalogValidationError("CATALOG_CODE_LOCKED", "No se puede cambiar el código de un servicio o producto que ya se usó en contratos o prefacturas.", "code");
  }
  const changes = { ...toCatalogRow(values, actorId), updated_at: new Date().toISOString() };
  const result = await db.from("billable_concepts").update(changes).eq("id", id).select(COLUMNS).single();
  fail(result.error, "No fue posible guardar el servicio o producto");
  await audit(db, { conceptId: id, action: catalogAuditAction(previous, toCatalogRow(values, actorId)), actorId, previous, next: result.data });
  return fromCatalogRow(result.data);
}

export async function deleteCatalogItem(db, id) {
  await getRow(db, id);
  const usage = await usageByConcept(db, [id]);
  if (usage.get(id)) throw new CatalogValidationError("CATALOG_IN_USE", "Este servicio o producto ya se usó en contratos o prefacturas: desactívalo en lugar de eliminarlo.");
  const result = await db.from("billable_concepts").delete().eq("id", id);
  fail(result.error, "No fue posible eliminar el servicio o producto");
  return { id, deleted: true };
}
