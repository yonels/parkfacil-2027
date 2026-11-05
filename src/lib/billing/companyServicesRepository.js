import "server-only";
import { CompanyServiceError, contractNumberFor, itemTypeForCategory, suggestedUnitPrice } from "./companyServicesCore.mjs";
import { fromCatalogRow } from "./catalogCore.mjs";

// Servicios a facturar por empresa (SOL-2026-11-05-005, F1.2). Usa el cliente de servicio; las rutas
// ya validaron permisos de facturación (hoy solo Root).
const ITEM_COLUMNS = "id,company_id,contract_id,concept_id,item_type,description,quantity,unit,unit_price,currency,periodicity,valid_from,valid_to,status,created_at,updated_at,billable_concepts(code,name,tax_category,item_kind)";
const CONTRACT_COLUMNS = "id,company_id,contract_number,status,currency,starts_on,ends_on,duration_months,automatic_renewal,payment_due_days";

function fail(error, message) {
  if (!error) return;
  const wrapped = new Error(`${message}: ${error.message}`);
  wrapped.code = error.code;
  throw wrapped;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function mapItem(row) {
  const concept = Array.isArray(row.billable_concepts) ? row.billable_concepts[0] : row.billable_concepts;
  return {
    id: row.id, contractId: row.contract_id, conceptId: row.concept_id, conceptCode: concept?.code || "", conceptName: concept?.name || "",
    taxCategory: concept?.tax_category || "UNDEFINED", itemKind: concept?.item_kind || "SERVICE", itemType: row.item_type,
    description: row.description, quantity: Number(row.quantity), unit: row.unit, unitPrice: Number(row.unit_price), currency: row.currency,
    periodicity: row.periodicity, validFrom: row.valid_from, validTo: row.valid_to, status: row.status, usageCount: Number(row.usage_count || 0),
  };
}

function mapContract(row) {
  if (!row) return null;
  return { id: row.id, number: row.contract_number, status: row.status, currency: row.currency, startsOn: row.starts_on, endsOn: row.ends_on, durationMonths: row.duration_months, automaticRenewal: Boolean(row.automatic_renewal), paymentDueDays: Number(row.payment_due_days || 0) };
}

// Contrato vigente hoy: activo, ya iniciado y no vencido (o con renovación automática). Si hay varios, el más reciente.
export async function currentContract(db, companyId, onDate = today()) {
  const result = await db.from("company_contracts").select(CONTRACT_COLUMNS).eq("company_id", companyId).eq("status", "active").lte("starts_on", onDate).or(`ends_on.gte.${onDate},automatic_renewal.eq.true`).order("starts_on", { ascending: false }).limit(1);
  fail(result.error, "No fue posible leer el contrato de la empresa");
  return result.data?.[0] || null;
}

async function getCompany(db, companyId) {
  const result = await db.from("companies").select("id,business_name,rut_number,rut_dv,status,relationship_type").eq("id", companyId).maybeSingle();
  fail(result.error, "No fue posible leer la empresa");
  if (!result.data) throw new CompanyServiceError("COMPANY_NOT_FOUND", "La empresa no existe.", null, 404);
  return result.data;
}

async function usageByItem(db, ids) {
  const usage = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return usage;
  const result = await db.from("billing_preinvoice_lines").select("contract_item_id").in("contract_item_id", ids);
  fail(result.error, "No fue posible revisar el uso de los servicios");
  for (const row of result.data || []) usage.set(row.contract_item_id, (usage.get(row.contract_item_id) || 0) + 1);
  return usage;
}

export async function listBillingCompanies(db) {
  const companies = await db.from("companies").select("id,business_name,rut_number,rut_dv,status").eq("relationship_type", "client").order("business_name");
  fail(companies.error, "No fue posible listar empresas");
  const items = await db.from("contract_billable_items").select("company_id").eq("status", "ACTIVE");
  fail(items.error, "No fue posible contar servicios");
  const counts = new Map();
  for (const row of items.data || []) counts.set(row.company_id, (counts.get(row.company_id) || 0) + 1);
  return (companies.data || []).map((company) => ({ id: company.id, name: company.business_name, rut: company.rut_number ? `${company.rut_number}-${company.rut_dv}` : "", status: company.status, activeServices: counts.get(company.id) || 0 }));
}

export async function getCompanyServices(db, companyId) {
  const company = await getCompany(db, companyId);
  const contract = await currentContract(db, companyId);
  let items = [];
  if (contract) {
    const result = await db.from("contract_billable_items").select(ITEM_COLUMNS).eq("company_id", companyId).eq("contract_id", contract.id).order("valid_from", { ascending: false }).order("created_at", { ascending: false });
    fail(result.error, "No fue posible listar los servicios de la empresa");
    const usage = await usageByItem(db, (result.data || []).map((row) => row.id));
    items = (result.data || []).map((row) => mapItem({ ...row, usage_count: usage.get(row.id) || 0 }));
  }
  const catalog = await db.from("billable_concepts").select("id,code,name,description,item_kind,category,unit,tax_category,periodicity,reference_currency,reference_price,status,updated_at").eq("status", "ACTIVE").order("name");
  fail(catalog.error, "No fue posible leer el catálogo");
  const mappedContract = mapContract(contract);
  return {
    company: { id: company.id, name: company.business_name, rut: company.rut_number ? `${company.rut_number}-${company.rut_dv}` : "", status: company.status },
    contract: mappedContract,
    items,
    catalog: (catalog.data || []).map((row) => { const concept = fromCatalogRow(row); return { ...concept, suggestedPrice: mappedContract ? suggestedUnitPrice(concept, mappedContract.currency) : null }; }),
  };
}

export async function createMinimalContract(db, companyId, values, actorId) {
  const company = await getCompany(db, companyId);
  if (await currentContract(db, companyId, values.startsOn)) throw new CompanyServiceError("CONTRACT_ALREADY_EXISTS", "La empresa ya tiene un contrato vigente.");
  let number = contractNumberFor({ rutNumber: company.rut_number, companyId, startsOn: values.startsOn });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt ? `${number}-${attempt + 1}` : number;
    const result = await db.from("company_contracts").insert({
      company_id: companyId, contract_number: candidate, status: "active", starts_on: values.startsOn, ends_on: values.endsOn,
      duration_months: values.durationMonths, automatic_renewal: values.automaticRenewal, currency: values.currency,
      payment_due_days: values.paymentDueDays, source_document: "Facturación Root: contrato mínimo para servicios a facturar (SOL-2026-11-05-005)",
      commercial_terms: { created_from: "facturacion_servicios", created_by: actorId || null },
    }).select(CONTRACT_COLUMNS).single();
    if (result.error?.code === "23505") continue;
    fail(result.error, "No fue posible crear el contrato");
    number = candidate;
    return mapContract(result.data);
  }
  throw new CompanyServiceError("CONTRACT_NUMBER_TAKEN", "No fue posible asignar un número de contrato único.");
}

export async function addServiceItem(db, companyId, values, actorId) {
  const contract = await currentContract(db, companyId);
  if (!contract) throw new CompanyServiceError("CONTRACT_REQUIRED", "La empresa no tiene contrato vigente: créalo antes de agregar servicios.");
  const concept = await db.from("billable_concepts").select("id,code,name,category,unit,status").eq("id", values.conceptId).maybeSingle();
  fail(concept.error, "No fue posible leer el servicio del catálogo");
  if (!concept.data || concept.data.status !== "ACTIVE") throw new CompanyServiceError("SERVICE_CONCEPT_INVALID", "El servicio o producto no existe o está inactivo.", "conceptId");
  const result = await db.from("contract_billable_items").insert({
    company_id: companyId, contract_id: contract.id, concept_id: concept.data.id, item_type: itemTypeForCategory(concept.data.category),
    description: values.description, quantity: values.quantity, included_quantity: 0, unit: concept.data.unit, unit_price: values.unitPrice,
    currency: contract.currency, periodicity: "MONTHLY", commercial_classification: "ADDITIONAL",
    valid_from: values.validFrom, valid_to: values.validTo, status: "ACTIVE", created_by: actorId || null,
  }).select(ITEM_COLUMNS).single();
  if (result.error?.code === "23505") throw new CompanyServiceError("SERVICE_DUPLICATE", "Ese servicio ya está asignado a la empresa con la misma fecha desde.", "validFrom");
  fail(result.error, "No fue posible agregar el servicio");
  return mapItem(result.data);
}

async function getItem(db, companyId, itemId) {
  const result = await db.from("contract_billable_items").select(ITEM_COLUMNS).eq("id", itemId).eq("company_id", companyId).maybeSingle();
  fail(result.error, "No fue posible leer el servicio");
  if (!result.data) throw new CompanyServiceError("SERVICE_NOT_FOUND", "El servicio no existe para esta empresa.", null, 404);
  return result.data;
}

export async function updateServiceItem(db, companyId, itemId, values) {
  const current = await getItem(db, companyId, itemId);
  const validFrom = values.validFrom || current.valid_from;
  const validTo = Object.hasOwn(values, "validTo") ? values.validTo : current.valid_to;
  if (validTo && validTo < validFrom) throw new CompanyServiceError("SERVICE_TO_INVALID", "La fecha hasta no puede ser anterior a la fecha desde.", "validTo");
  const changes = { updated_at: new Date().toISOString() };
  if (Object.hasOwn(values, "description")) changes.description = values.description;
  if (Object.hasOwn(values, "quantity")) changes.quantity = values.quantity;
  if (Object.hasOwn(values, "unitPrice")) changes.unit_price = values.unitPrice;
  if (Object.hasOwn(values, "validFrom")) changes.valid_from = values.validFrom;
  if (Object.hasOwn(values, "validTo")) changes.valid_to = values.validTo;
  if (Object.hasOwn(values, "status")) changes.status = values.status;
  const result = await db.from("contract_billable_items").update(changes).eq("id", itemId).eq("company_id", companyId).select(ITEM_COLUMNS).single();
  if (result.error?.code === "23505") throw new CompanyServiceError("SERVICE_DUPLICATE", "Ese servicio ya está asignado a la empresa con la misma fecha desde.", "validFrom");
  fail(result.error, "No fue posible guardar el servicio");
  return mapItem(result.data);
}

export async function deleteServiceItem(db, companyId, itemId) {
  await getItem(db, companyId, itemId);
  const usage = await usageByItem(db, [itemId]);
  if (usage.get(itemId)) throw new CompanyServiceError("SERVICE_IN_USE", "Este servicio ya se prefacturó: termínalo (fecha hasta o estado Terminado) en lugar de eliminarlo.");
  const result = await db.from("contract_billable_items").delete().eq("id", itemId).eq("company_id", companyId);
  fail(result.error, "No fue posible eliminar el servicio");
  return { id: itemId, deleted: true };
}
