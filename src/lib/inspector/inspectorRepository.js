import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { expireDueOnStreetPilotSessions } from "@/lib/onStreetPilotRepository";
import { resolveOnStreetPlateState } from "./inspectorPlateStateCore.mjs";
import { inspectorSmsReportRowInScope } from "./inspectorSmsReportCore.mjs";

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

// Detalle de UNA fiscalización ya existente (2026-09-03, "abrir detalle
// desde la lista de Fiscalizaciones"): SOLO LECTURA -- ningún UPDATE/INSERT,
// nunca reenvía SMS ni vuelve a llamar register_on_street_inspection. Acotado
// al mismo inspector que la registró (igual criterio que
// listInspectorInspections, nunca expone la fiscalización de otro
// inspector) -- devuelve null si no existe o pertenece a otro inspector, sin
// distinguir el motivo (mismo criterio de "no filtrar existencia" que el
// resto de Inspector). Incluye las columnas de trazabilidad de SMS
// conductor/copia inspector (persistidas por register_on_street_inspection y
// por la migración 20260903011348) para poder reconstruir la misma pantalla
// de resultado que ya usa InspectorFiscalizacion.js justo después de
// registrar, sin inventar una pantalla nueva.
export async function getInspectorInspectionById(id, inspectorUserId, db = getSupabaseAdminClient()) {
  const result = await db
    .from("on_street_inspections")
    .select("id,license_plate_normalized,inspection_type,inspected_at,sms_required,sms_status,inspector_copy_sms_status,inspector_copy_sms_sent_at,inspector_copy_sms_provider_message_id")
    .eq("id", id)
    .eq("inspector_user_id", inspectorUserId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

// Mapa id->email de todos los Inspectores reales (2026-09-03, Reporte SMS):
// mismo mecanismo ya usado por listInspectorUsers/inspectorEmailMap en
// onStreetAdminInspectionsRepository.js (app_metadata.role==="inspector",
// el Inspector vive únicamente en Supabase Auth, sin tabla de perfil
// propia) -- se duplica aquí en vez de importar ese archivo administrativo
// (RBAC/scoping de empresa distintos) para no acoplar los dos módulos.
export async function inspectorEmailById(db = getSupabaseAdminClient()) {
  const result = await db.auth.admin.listUsers({ perPage: 200 });
  if (result.error) throw result.error;
  const map = new Map();
  for (const u of result.data?.users || []) {
    if (u.app_metadata?.role === "inspector") map.set(u.id, u.email || "—");
  }
  return map;
}

// --- Reporte SMS Inspector (2026-09-03, alcance RBAC agregado el mismo día
// tras revisión) -- SOLO LECTURA en todo momento, alcance SIEMPRE aplicado
// server-side vía `scope`, nunca confiado a un filtro de frontend. ---
//
// scope: { type: "own", inspectorUserId } -- portal Inspector (§1 del
//   informe): SOLO sus propias fiscalizaciones. Es el ÚNICO scope que puede
//   llegar por /api/inspector/sms-report* -- ver el candado de portal en
//   contextCore.mjs (resolveAuthenticatedContext): una cuenta Inspector
//   JAMÁS autentica con otro portal, así que esta ruta nunca puede recibir
//   una request de otro rol para intentar ampliarlo.
// scope: { type: "company", parkingIds } -- portal admin (§2): company_admin,
//   acotado a los mismos parkingIds que ya resuelve scopedParkings
//   (onStreetAdminRepository.js) para el resto del backoffice On Street.
// scope: { type: "global" } -- portal admin (§3): platform_admin únicamente.
//
// NO_SESSION/OTHER (sms_required siempre false, nunca aparecen con
// sms_status='SENT') tienen parking_id null -- fuera de scope "company" por
// construcción (mismo criterio que listOnStreetInspections), lo cual es
// correcto: nunca tuvieron SMS que reportar de todas formas.
// Fail-closed: un scope ausente/malformado/de tipo no reconocido NUNCA cae
// a "sin filtro" (global) -- solo scope.type==="global" explícito da acceso
// sin restricción. Cualquier otra cosa (incluido undefined) filtra por un
// id imposible, devolviendo 0 filas -- mismo criterio "fail-closed" que
// inspectorSmsReportRowInScope (inspectorSmsReportCore.mjs), reutilizada
// abajo para no duplicar la lógica de qué fila pertenece a qué scope.
function applyInspectorSmsReportScope(query, scope) {
  if (scope?.type === "own") return query.eq("inspector_user_id", scope.inspectorUserId);
  if (scope?.type === "company") return query.in("parking_id", scope.parkingIds?.length ? scope.parkingIds : ["00000000-0000-0000-0000-000000000000"]);
  if (scope?.type === "global") return query;
  return query.eq("id", "00000000-0000-0000-0000-000000000000"); // scope inválido/ausente: 0 filas, nunca todas
}

const SMS_REPORT_COLUMNS = "id,session_id,license_plate_normalized,phone_normalized,inspector_user_id,parking_id,inspection_type,inspected_at,sms_required,sms_status,sms_sent_at,sms_provider_message_id,sms_delivery_status,sms_delivery_checked_at,sms_delivery_description,inspector_copy_sms_status,inspector_copy_sms_sent_at,inspector_copy_sms_provider_message_id";

export async function listInspectorSmsReportRows(db = getSupabaseAdminClient(), { from, to, limit = 500, scope } = {}) {
  let query = db.from("on_street_inspections").select(SMS_REPORT_COLUMNS).order("inspected_at", { ascending: false }).limit(limit);
  if (from) query = query.gte("inspected_at", from);
  if (to) query = query.lte("inspected_at", to);
  query = applyInspectorSmsReportScope(query, scope);
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

// Detalle de una fila del Reporte SMS -- filtra por scope en la MISMA query
// (defensa en profundidad #1) Y vuelve a verificar la fila ya traída antes
// de devolverla (defensa en profundidad #2, inspectorSmsReportRowInScope) --
// si no calza, devuelve null exactamente igual que "no existe" (mismo
// criterio de "no filtrar existencia" que getInspectorInspectionById): un
// inspector A nunca puede distinguir "no existe" de "es de otro inspector".
export async function getInspectorSmsReportDetail(id, db = getSupabaseAdminClient(), scope) {
  let query = db.from("on_street_inspections").select(SMS_REPORT_COLUMNS).eq("id", id);
  query = applyInspectorSmsReportScope(query, scope);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  if (!inspectorSmsReportRowInScope(result.data, scope)) return null;
  return result.data || null;
}

// Solo las filas candidatas a "Actualizar pendientes" (TAREA 8): sms_status
// SENT (el proveedor aceptó -- sin esto no hay nada que consultar), con
// provider_message_id (requerido por sentralandQueryStatus), y todavía sin
// un estado DLR final (sms_delivery_status null, o quedó en un estado
// intermedio -- ACCEPTED -- que igual conviene reconsultar; DELIVERED/
// UNDELIVERED/EXPIRED/REJECTED ya son finales y no se vuelven a tocar).
// Acotado por scope igual que el listado -- "Actualizar pendientes" de un
// Inspector nunca toca mensajes de otro inspector, ni de otra empresa.
export async function listPendingInspectorSmsDeliveryChecks(db = getSupabaseAdminClient(), limit = 50, scope) {
  let query = db
    .from("on_street_inspections")
    .select("id,sms_provider_message_id,sms_delivery_status")
    .eq("sms_status", "SENT")
    .not("sms_provider_message_id", "is", null)
    .or("sms_delivery_status.is.null,sms_delivery_status.eq.ACCEPTED")
    .order("inspected_at", { ascending: true })
    .limit(limit);
  query = applyInspectorSmsReportScope(query, scope);
  const result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

// Persiste ÚNICAMENTE las 3 columnas de entrega (TAREA 8) -- nunca toca
// sms_status/sms_sent_at/sms_provider_message_id (que documentan el ENVÍO,
// no la entrega) ni ninguna otra columna. Mismo patrón "UPDATE de mejor
// esfuerzo" que persistInspectorCopySmsStatus en
// inspectorInspectionService.js, pero esta función SÍ propaga el error al
// llamador (a diferencia de aquella): aquí no hay ninguna fiscalización en
// curso que proteger de un fallo transitorio -- es una acción explícita del
// usuario ("Actualizar estado"), que debe saber si falló.
export async function persistInspectorSmsDeliveryStatus(id, patch, db = getSupabaseAdminClient()) {
  const result = await db
    .from("on_street_inspections")
    .update({
      sms_delivery_status: patch.smsDeliveryStatus ?? null,
      sms_delivery_checked_at: patch.smsDeliveryCheckedAt ?? new Date().toISOString(),
      sms_delivery_description: patch.smsDeliveryDescription ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id,sms_delivery_status,sms_delivery_checked_at,sms_delivery_description")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}
