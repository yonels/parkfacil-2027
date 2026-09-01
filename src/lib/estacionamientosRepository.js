import "server-only";
import { getParkingMetrics, getSectorMetrics, nextParkingCodeBatch } from "@/lib/estacionamientos.mjs";

function mapSector(row) {
  return {
    id: row.id, parkingId: row.parking_id, code: row.code, name: row.name, type: row.type, status: row.status,
    capacity: row.capacity, occupied: row.occupied, notes: row.notes || "", level: row.level || "", zone: row.zone || "",
    locationDescription: row.location_description || "", accessCount: row.access_count || 0, exitCount: row.exit_count || 0,
    street: row.street || "", from: row.from_reference || "", to: row.to_reference || "", district: row.district || "",
    segmentDescription: row.segment_description || "",
  };
}

export function parkingRowInput(input) {
  return { code: input.code, name: input.name, company_id: input.companyId, company_name: input.companyName || input.companyId, type: input.type, status: input.status, address: input.address, city: input.city, country: input.country, schedule: input.schedule, description: input.description, access_count: input.accessCount, exit_count: input.exitCount };
}

export function sectorRowInput(input, parkingId) {
  const offStreet = input.type === "OFF_STREET";
  return { parking_id: parkingId, code: input.code, name: input.name, type: input.type, status: input.status, capacity: input.capacity, occupied: input.occupied, notes: input.notes, level: offStreet ? input.level : null, zone: offStreet ? input.zone : null, location_description: offStreet ? input.locationDescription : null, access_count: offStreet ? input.accessCount : 0, exit_count: offStreet ? input.exitCount : 0, street: offStreet ? null : input.street, from_reference: offStreet ? null : input.from, to_reference: offStreet ? null : input.to, district: offStreet ? null : input.district, segment_description: offStreet ? null : input.segmentDescription };
}

function applyParkingScope(query, { companyId = null, parkingIds = null } = {}) {
  let scoped = query;
  if (companyId) scoped = scoped.eq("company_id", companyId);
  if (parkingIds) scoped = scoped.in("id", parkingIds);
  return scoped;
}

export async function listParkings(supabase, scope = {}) {
  if (Array.isArray(scope.parkingIds) && scope.parkingIds.length === 0) return [];
  const parkingQuery = applyParkingScope(supabase.from("parkings").select("*").order("code"), scope);
  const { data: rows, error } = await parkingQuery;
  if (error) throw error;
  const ids = (rows || []).map((row) => row.id);
  if (!ids.length) return [];
  const { data: sectorRows, error: sectorError } = await supabase.from("parking_sectors").select("*").in("parking_id", ids).order("code");
  if (sectorError) throw sectorError;
  return (rows || []).map((row) => {
    const parking = {
    id: row.id, code: row.code, name: row.name, companyId: row.company_id, companyName: row.company_name || "Empresa asociada",
    type: row.type, status: row.status, address: row.address, city: row.city, country: row.country, schedule: row.schedule,
    description: row.description || "", accessCount: row.access_count, exitCount: row.exit_count,
      sectors: (sectorRows || []).filter((sector) => sector.parking_id === row.id).map(mapSector),
    };
    return { ...parking, sectors: parking.sectors.map((sector) => ({ ...sector, ...getSectorMetrics(sector) })), metrics: getParkingMetrics(parking) };
  });
}

export async function getParking(supabase, identifier, scope = {}) {
  const parkings = await listParkings(supabase, scope);
  const normalized = String(identifier || "").toUpperCase();
  return parkings.find((parking) => parking.id.toUpperCase() === normalized || parking.code.toUpperCase() === normalized) || null;
}

// ============================================================
// Catálogo de códigos de Estacionamiento/Proyecto (corrección funcional
// 2026-08-29, ver migración 20260829120000_parking_code_catalog.sql).
// Definición aprobada: catálogo GLOBAL administrado por Root; el usuario
// elige un código AVAILABLE, nunca lo escribe.
// ============================================================

export async function listAvailableParkingCodes(db) {
  const { data, error } = await db.from("parking_code_catalog").select("id,code").eq("status", "AVAILABLE").order("code");
  if (error) throw error;
  return data || [];
}

// Vista de administración (Root): catálogo completo con a qué
// estacionamiento quedó ligado cada código ASSIGNED, si corresponde.
export async function listParkingCodeCatalog(db) {
  const { data, error } = await db.from("parking_code_catalog").select("id,code,status,parking_id,created_at,assigned_at,parkings(name,code,company_name)").order("code");
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id, code: row.code, status: row.status, createdAt: row.created_at, assignedAt: row.assigned_at,
    parking: row.parkings ? { id: row.parking_id, name: row.parkings.name, companyName: row.parkings.company_name } : null,
  }));
}

export class CatalogCodeExistsError extends Error {
  constructor() { super("CATALOG_CODE_EXISTS"); this.name = "CatalogCodeExistsError"; this.code = "CATALOG_CODE_EXISTS"; }
}

export async function addParkingCatalogCode(db, code) {
  const { data, error } = await db.from("parking_code_catalog").insert({ code, status: "AVAILABLE" }).select("id,code,status,created_at").single();
  if (error) { if (error.code === "23505") throw new CatalogCodeExistsError(); throw error; }
  return data;
}

export class CatalogCodeInvalidTransitionError extends Error {
  constructor() { super("CATALOG_CODE_INVALID_TRANSITION"); this.name = "CatalogCodeInvalidTransitionError"; this.code = "CATALOG_CODE_INVALID_TRANSITION"; }
}

// Inactivar (continuación 2026-08-29): SOLO desde AVAILABLE -- nunca desde
// ASSIGNED, para no romper la relación histórica con su parking (ver
// migración 20260829130000: INACTIVE exige parking_id/assigned_at nulos,
// igual que AVAILABLE -- un código inactivo nunca pasó por ASSIGNED).
// UPDATE condicional (mismo patrón de compare-and-swap que
// createParkingWithCatalogCode) para que dos solicitudes simultáneas sobre
// el mismo código no produzcan un resultado inconsistente.
export async function inactivateParkingCode(db, id) {
  const { data, error } = await db.from("parking_code_catalog").update({ status: "INACTIVE" }).eq("id", id).eq("status", "AVAILABLE").select("id,code,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new CatalogCodeInvalidTransitionError();
  return data;
}

// Reactivar: SOLO desde INACTIVE. Por construcción del modelo (ver arriba)
// un código INACTIVE nunca estuvo ligado a un parking, así que reactivar es
// siempre seguro -- no hace falta revisar parking_id aparte.
export async function reactivateParkingCode(db, id) {
  const { data, error } = await db.from("parking_code_catalog").update({ status: "AVAILABLE" }).eq("id", id).eq("status", "INACTIVE").select("id,code,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new CatalogCodeInvalidTransitionError();
  return data;
}

export class CatalogCodeNotAvailableError extends Error {
  constructor() { super("CATALOG_CODE_NOT_AVAILABLE"); this.name = "CatalogCodeNotAvailableError"; this.code = "CATALOG_CODE_NOT_AVAILABLE"; }
}

// Reposición automática (decisión aprobada 2026-08-29): se dispara en el
// momento de asignar un código (no por cron, que quedó explícitamente fuera
// de alcance) -- cada vez que una asignación deja <=10 códigos AVAILABLE,
// genera 100 nuevos siguiendo la serie PF-XXX ya existente (ver
// nextParkingCodeBatch). Nunca revienta la creación del estacionamiento que
// la disparó: cualquier error de reposición (incluida una carrera donde dos
// asignaciones simultáneas intentan reponer el mismo rango -- la segunda
// choca contra el unique(code) y se descarta sin problema) se registra y se
// ignora, la asignación ya ocurrida sigue siendo válida.
export async function replenishParkingCodesIfLow(db, { threshold = 10, batchSize = 100 } = {}) {
  try {
    const availableCount = await db.from("parking_code_catalog").select("id", { count: "exact", head: true }).eq("status", "AVAILABLE");
    if (availableCount.error) throw availableCount.error;
    if ((availableCount.count || 0) > threshold) return { replenished: false, added: 0 };

    const all = await db.from("parking_code_catalog").select("code");
    if (all.error) throw all.error;
    const batch = nextParkingCodeBatch((all.data || []).map((row) => row.code), batchSize);

    const inserted = await db.from("parking_code_catalog").insert(batch.map((code) => ({ code, status: "AVAILABLE" }))).select("id");
    if (inserted.error) throw inserted.error;
    return { replenished: true, added: inserted.data?.length || 0 };
  } catch (error) {
    console.error("[parking-code-catalog:replenish]", { code: error?.code, message: error?.message });
    return { replenished: false, added: 0, error: error?.message };
  }
}

// Crea el Estacionamiento y consume su código del catálogo. Orden
// deliberado (no es una única transacción SQL -- ver informe): primero se
// inserta el parking (parkings.code sigue siendo UNIQUE, mismo respaldo de
// siempre); solo si eso funciona se reclama el código en el catálogo con un
// UPDATE condicional atómico (status='AVAILABLE' -> 'ASSIGNED', ligando
// parking_id) -- si otra solicitud concurrente ya se lo llevó, o el código
// nunca estuvo en el catálogo, esa UPDATE afecta 0 filas y se revierte el
// parking recién creado (nada más lo referencia todavía en ese instante).
// Así, ninguna combinación de condición de carrera dos códigos iguales:
// parkings.code UNIQUE lo impide en el primer paso; el catálogo lo impide
// en el segundo.
export async function createParkingWithCatalogCode(db, payload) {
  const available = await db.from("parking_code_catalog").select("id").eq("code", payload.code).eq("status", "AVAILABLE").maybeSingle();
  if (available.error) throw available.error;
  if (!available.data) throw new CatalogCodeNotAvailableError();

  const inserted = await db.from("parkings").insert(parkingRowInput(payload)).select("*").limit(1);
  if (inserted.error) throw inserted.error;
  const parking = inserted.data[0];

  const claimed = await db.from("parking_code_catalog")
    .update({ status: "ASSIGNED", parking_id: parking.id, assigned_at: new Date().toISOString() })
    .eq("code", payload.code).eq("status", "AVAILABLE")
    .select("id");
  if (claimed.error) { await db.from("parkings").delete().eq("id", parking.id); throw claimed.error; }
  if (!claimed.data || claimed.data.length === 0) {
    await db.from("parkings").delete().eq("id", parking.id);
    throw new CatalogCodeNotAvailableError();
  }
  // Secuencia infinita (decisión aprobada 2026-08-29): revisa DESPUÉS de
  // asignar -- best-effort, nunca bloquea ni revierte la creación ya
  // completada del estacionamiento aunque la reposición fallara.
  await replenishParkingCodesIfLow(db);
  return parking;
}
