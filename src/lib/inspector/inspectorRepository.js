import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { expireDueOnStreetPilotSessions } from "@/lib/onStreetPilotRepository";
import { resolveOnStreetPlateState } from "./inspectorPlateStateCore.mjs";

// Consulta GLOBAL de patente (Etapa 2, §3.1): deliberadamente sin
// parking_id/company_id en ningún filtro -- un Inspector puede consultar
// cualquier patente de cualquier sector/estacionamiento. Expira primero
// (mismo mecanismo global ya usado por el reconciliador de pagos) para que
// "sesión ACTIVE" aquí siempre implique expires_at real en el futuro, nunca
// una sesión vencida que todavía no fue barrida.
export async function findOnStreetPlateState(plate, db = getSupabaseAdminClient()) {
  await expireDueOnStreetPilotSessions(db);

  const active = await db
    .from("on_street_pilot_sessions")
    .select("id,qr_location_id,parking_id,phone_normalized,started_at,expires_at,purchased_minutes,amount_paid")
    .eq("license_plate_normalized", plate)
    .eq("status", "ACTIVE")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active.error) throw active.error;

  let expired = { data: null };
  if (!active.data) {
    expired = await db
      .from("on_street_pilot_sessions")
      .select("id,qr_location_id,parking_id,phone_normalized,started_at,expires_at,purchased_minutes,amount_paid")
      .eq("license_plate_normalized", plate)
      .eq("status", "EXPIRED")
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (expired.error) throw expired.error;
  }

  const relevantSession = active.data || expired.data;
  const [sessionInspectionResult, latestInspectionResult, recentInspectionsResult] = await Promise.all([
    relevantSession && !active.data
      ? db.from("on_street_inspections").select("id,inspection_type,inspected_at").eq("session_id", relevantSession.id).eq("inspection_type", "OVERSTAY").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("on_street_inspections").select("id,inspection_type,inspected_at").eq("license_plate_normalized", plate).order("inspected_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("on_street_inspections").select("id,inspection_type,inspected_at").eq("license_plate_normalized", plate).order("inspected_at", { ascending: false }).limit(5),
  ]);
  if (sessionInspectionResult.error) throw sessionInspectionResult.error;
  if (latestInspectionResult.error) throw latestInspectionResult.error;
  if (recentInspectionsResult.error) throw recentInspectionsResult.error;

  const location = relevantSession ? await getOnStreetLocationNames(relevantSession.qr_location_id, db) : null;

  return resolveOnStreetPlateState({
    plate,
    activeSession: active.data || null,
    expiredSession: expired.data || null,
    sessionInspection: sessionInspectionResult.data || null,
    latestInspection: latestInspectionResult.data || null,
    recentInspections: recentInspectionsResult.data || [],
    location,
  });
}

// Igual que la sesión de arriba: dado un session_id ya confirmado como
// EXPIRED por findOnStreetPlateState/registerInspection, entrega los datos
// que el registro de fiscalización necesita (incluido el teléfono real,
// nunca provisto por el cliente -- §10) sin volver a exponerlos a la UI.
export async function getOnStreetSessionForInspection(sessionId, db = getSupabaseAdminClient()) {
  const result = await db
    .from("on_street_pilot_sessions")
    .select("id,qr_location_id,parking_id,phone_normalized,license_plate_normalized,status,expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

export async function getOnStreetLocationNames(qrLocationId, db = getSupabaseAdminClient()) {
  if (!qrLocationId) return null;
  const qrResult = await db.from("on_street_qr_locations").select("sector_id,street_id,segment_id").eq("id", qrLocationId).maybeSingle();
  if (qrResult.error) throw qrResult.error;
  if (!qrResult.data) return null;
  const [sector, street, segment] = await Promise.all([
    db.from("parking_sectors").select("name").eq("id", qrResult.data.sector_id).maybeSingle(),
    db.from("parking_streets").select("name").eq("id", qrResult.data.street_id).maybeSingle(),
    db.from("parking_street_segments").select("name").eq("id", qrResult.data.segment_id).maybeSingle(),
  ]);
  if (sector.error) throw sector.error;
  if (street.error) throw street.error;
  if (segment.error) throw segment.error;
  return { sectorName: sector.data?.name || null, streetName: street.data?.name || null, segmentName: segment.data?.name || null };
}

// Listado global de patentes observadas (Etapa 2, §14/§16): última
// fiscalización por patente, más reciente primero. Sin DISTINCT ON vía el
// query builder -- se pide un lote reciente ya ordenado y se deduplica en
// JS (mismo criterio que listParkingPilotSessions al construir sus mapas).
export async function listObservedPlates(db = getSupabaseAdminClient(), limit = 100) {
  const result = await db
    .from("on_street_inspections")
    .select("license_plate_normalized,inspection_type,inspected_at")
    .order("inspected_at", { ascending: false })
    .limit(500);
  if (result.error) throw result.error;
  const seen = new Map();
  for (const row of result.data || []) {
    if (!seen.has(row.license_plate_normalized)) seen.set(row.license_plate_normalized, row);
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// Opciones de contexto territorial (Etapa 3, §13/§14): jerarquía real
// Estacionamiento->Área->Calle->Tramo, SIN ningún filtro de empresa -- el
// Inspector conserva su alcance global (§3); esto es solo para que pueda
// declarar DÓNDE está trabajando cuando fiscaliza una patente sin sesión
// (NO_SESSION/OTHER), donde no hay ninguna sesión real de la que derivar el
// estacionamiento. Reutiliza las mismas tablas que el resto de On Street
// (parkings/parking_sectors/parking_streets/parking_street_segments/
// on_street_qr_locations) -- no se crea un catálogo paralelo. Cuando un
// tramo tiene una ubicación QR real asociada, se expone su id para poder
// registrar qr_location_id además de parking_id (más preciso); si no la
// tiene, el contexto igual sirve para atribuir parking_id (soluciona el
// caso real "Sin estacionamiento asignado" encontrado en Etapa 2).
export async function listInspectorContextOptions(db = getSupabaseAdminClient()) {
  const [parkingsResult, areasResult, streetsResult, segmentsResult, locationsResult] = await Promise.all([
    db.from("parkings").select("id,code,name,company_name").eq("type", "ON_STREET").eq("status", "ACTIVE").order("name"),
    db.from("parking_sectors").select("id,parking_id,code,name").order("name"),
    db.from("parking_streets").select("id,parking_id,sector_id,name").order("name"),
    db.from("parking_street_segments").select("id,parking_id,area_id,street_id,code,name").order("name"),
    db.from("on_street_qr_locations").select("id,segment_id").eq("status", "ACTIVE"),
  ]);
  for (const result of [parkingsResult, areasResult, streetsResult, segmentsResult, locationsResult]) {
    if (result.error) throw result.error;
  }
  const parkingIds = new Set((parkingsResult.data || []).map((p) => p.id));
  const locationBySegment = new Map((locationsResult.data || []).map((l) => [l.segment_id, l.id]));
  return {
    parkings: (parkingsResult.data || []).map((p) => ({ id: p.id, name: p.name, companyName: p.company_name || null })),
    areas: (areasResult.data || []).filter((a) => parkingIds.has(a.parking_id)),
    streets: (streetsResult.data || []).filter((s) => parkingIds.has(s.parking_id)),
    segments: (segmentsResult.data || []).filter((s) => parkingIds.has(s.parking_id)).map((s) => ({ ...s, qrLocationId: locationBySegment.get(s.id) || null })),
  };
}

// Historial real del inspector (Etapa 2, §15): solo sus propias
// fiscalizaciones -- nunca las de otro inspector, nunca información
// administrativa.
export async function listInspectorInspections(inspectorUserId, db = getSupabaseAdminClient(), limit = 50) {
  const result = await db
    .from("on_street_inspections")
    .select("id,license_plate_normalized,inspection_type,vehicle_still_present,observations,inspected_at,sms_required,sms_status")
    .eq("inspector_user_id", inspectorUserId)
    .order("inspected_at", { ascending: false })
    .limit(limit);
  if (result.error) throw result.error;
  return result.data || [];
}
