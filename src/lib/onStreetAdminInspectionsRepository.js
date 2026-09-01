import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { ROLES } from "./auth/permissions.mjs";
import { scopedParkings } from "./onStreetAdminRepository";
import { resolvePeriodBounds } from "./onStreetDashboardCore.mjs";
import { computeInspectionKpis, emptyInspectionKpis } from "./onStreetInspectionsAdminCore.mjs";

async function companiesByIds(db, companyIds) {
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const result = await db.from("companies").select("id,trade_name,business_name").in("id", ids);
  if (result.error) throw result.error;
  return new Map((result.data || []).map((c) => [c.id, c.trade_name || c.business_name]));
}

function fail(result) { if (result.error) throw result.error; return result.data || []; }

// Administración QR On Street -- Fiscalizaciones/Inspectores (completa la
// Etapa 2 de Inspectores dentro de la Administración On Street, sección
// 20/21/44/45 del brief). Reutiliza on_street_inspections tal cual quedó
// en la migración de Inspectores (20260827200000_on_street_inspections.sql)
// -- NO duplica esa infraestructura, solo la consulta desde el lado
// administrativo con el mismo aislamiento por empresa que el resto del
// módulo On Street (scopedParkings).
//
// NO_SESSION/OTHER: una fiscalización de este tipo no tiene sesión ni
// ubicación asociada (parking_id queda null, ver inspectorInspectionService.js),
// así que nunca puede atribuirse a una empresa concreta. company_admin/
// operator (acotados a parkingIds propios vía .in("parking_id", ids)) nunca
// las ven -- correcto por diseño, no un error: solo platform_admin (sin
// filtro de parking_id) tiene visibilidad global real, igual que en el
// resto del sistema.
async function scopedParkingIds(db, context, companyId) {
  const parkings = await scopedParkings(db, context, companyId);
  return parkings.map((p) => p.id);
}

// Devuelve, por qr_location_id: los ids crudos de la jerarquía (para
// filtrar por área/calle/tramo) y los nombres ya resueltos (para mostrar).
async function locationNamesByQrId(db, qrLocationIds) {
  const ids = [...new Set(qrLocationIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const qrs = fail(await db.from("on_street_qr_locations").select("id,parking_id,sector_id,street_id,segment_id").in("id", ids));
  const sectorIds = [...new Set(qrs.map((q) => q.sector_id))], streetIds = [...new Set(qrs.map((q) => q.street_id))], segmentIds = [...new Set(qrs.map((q) => q.segment_id))], parkingIds = [...new Set(qrs.map((q) => q.parking_id))];
  const [sectors, streets, segments, parkings] = await Promise.all([
    sectorIds.length ? fail(await db.from("parking_sectors").select("id,name").in("id", sectorIds)) : [],
    streetIds.length ? fail(await db.from("parking_streets").select("id,name").in("id", streetIds)) : [],
    segmentIds.length ? fail(await db.from("parking_street_segments").select("id,name").in("id", segmentIds)) : [],
    parkingIds.length ? fail(await db.from("parkings").select("id,name,company_id,company_name").in("id", parkingIds)) : [],
  ]);
  const companyMap = await companiesByIds(db, parkings.map((p) => p.company_id));
  const sectorMap = new Map(sectors.map((s) => [s.id, s.name])), streetMap = new Map(streets.map((s) => [s.id, s.name])), segmentMap = new Map(segments.map((s) => [s.id, s.name])), parkingMap = new Map(parkings.map((p) => [p.id, p]));
  const byQr = new Map();
  for (const qr of qrs) {
    const parking = parkingMap.get(qr.parking_id);
    byQr.set(qr.id, {
      parkingId: qr.parking_id, sectorId: qr.sector_id, streetId: qr.street_id, segmentId: qr.segment_id,
      parkingName: parking?.name || "—",
      companyName: (parking && (companyMap.get(parking.company_id) || parking.company_name)) || "—",
      sectorName: sectorMap.get(qr.sector_id) || "—",
      streetName: streetMap.get(qr.street_id) || "—",
      segmentName: segmentMap.get(qr.segment_id) || "—",
      label: [streetMap.get(qr.street_id), segmentMap.get(qr.segment_id)].filter(Boolean).join(" / ") || parking?.name || "—",
    });
  }
  return byQr;
}

// Detalle READ ONLY de una fiscalización (Etapa 3, §31): misma consulta que
// el listado (una sola fila por id), con el mismo aislamiento por empresa
// -- company_admin/operator solo pueden ver una fiscalización cuyo
// parking_id esté dentro de su alcance; platform_admin ve cualquiera,
// incluidas las "unassigned" (parking_id null). Nunca se expone algo que el
// listado ya no mostrara -- mismos campos, una sola fila.
export async function getOnStreetInspectionDetail(db, context, id) {
  const result = await db.from("on_street_inspections")
    .select("id,license_plate_normalized,session_id,qr_location_id,parking_id,inspector_user_id,inspection_type,vehicle_still_present,observations,latitude,longitude,inspected_at,sms_required,sms_status,sms_sent_at,sms_provider_message_id")
    .eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  const row = result.data;
  if (!row) return null;
  if (row.parking_id) {
    const parkingIds = await scopedParkingIds(db, context, null);
    if (!parkingIds.includes(row.parking_id)) return null;
  } else if (context.role !== ROLES.PLATFORM_ADMIN) {
    // Sin estacionamiento asignado: solo platform_admin puede verla (mismo
    // criterio que listOnStreetInspections).
    return null;
  }
  const [locationMap, inspectorMap] = await Promise.all([
    locationNamesByQrId(db, [row.qr_location_id]),
    inspectorEmailMap(db),
  ]);
  return { ...row, location: locationMap.get(row.qr_location_id) || null, inspectorEmail: inspectorMap.get(row.inspector_user_id) || "—", unassigned: !row.parking_id };
}

// Todos los Inspectores reales (app_metadata.role === "inspector") --
// mismo mecanismo de bootstrap que Root (ver rootBootstrapCore.mjs), no una
// tabla paralela: el usuario Inspector vive únicamente en Supabase Auth.
export async function listInspectorUsers(db = getSupabaseAdminClient()) {
  const result = await db.auth.admin.listUsers({ perPage: 200 });
  if (result.error) throw result.error;
  return (result.data?.users || []).filter((u) => u.app_metadata?.role === "inspector").map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.user_metadata?.full_name || null,
    active: !u.banned_until || new Date(u.banned_until) <= new Date(),
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at || null,
  }));
}

async function inspectorEmailMap(db) {
  const inspectors = await listInspectorUsers(db);
  return new Map(inspectors.map((i) => [i.id, i.email]));
}

// Listado de fiscalizaciones, acotado por empresa y período -- misma forma
// de filtros (period/from/to/parkingId/areaId/streetId/segmentId) que el
// resto del módulo On Street, para reutilizar los mismos controles de
// filtro en la UI.
export async function listOnStreetInspections(db, context, input = {}) {
  const bounds = resolvePeriodBounds(input.period || "7d", { from: input.from, to: input.to });
  const parkingIds = await scopedParkingIds(db, context, input.companyId || null);
  if (!bounds) return { rows: [], bounds, kpis: emptyInspectionKpis(), unassignedCount: 0 };
  if (!parkingIds.length) return { rows: [], bounds, kpis: emptyInspectionKpis(), unassignedCount: 0 };

  let query = db.from("on_street_inspections")
    .select("id,license_plate_normalized,session_id,qr_location_id,parking_id,inspector_user_id,inspection_type,vehicle_still_present,observations,latitude,longitude,inspected_at,sms_required,sms_status,sms_sent_at")
    .in("parking_id", parkingIds)
    .gte("inspected_at", bounds.from).lte("inspected_at", bounds.to)
    .order("inspected_at", { ascending: false })
    .limit(1000);
  const rows = fail(await query);

  // Fiscalizaciones NO_SESSION/OTHER sin sesión asociada (§9 de la
  // auditoría): registerOnStreetInspection (Inspectores Etapa 2) solo
  // persiste parking_id/qr_location_id cuando existe una sesión OVERSTAY
  // real -- la app de Inspectores hoy captura únicamente GPS (latitude/
  // longitude), sin selección de estacionamiento ni ubicación con
  // coordenadas propias que permitan una geo-referenciación real (ninguna
  // tabla on_street_qr_locations/parking_street_segments tiene
  // latitude/longitude, se confirmó en el esquema). Por eso parking_id
  // queda NULL y es estructuralmente imposible atribuirlas a una empresa:
  // NUNCA se muestran a company_admin/operator (mantiene el aislamiento
  // multiempresa), y solo platform_admin obtiene una vista global especial
  // de estos registros, marcados explícitamente "unassigned" -- nunca se
  // les inventa un parking_id ficticio. Solución completa pendiente,
  // documentada en el informe: agregar un selector de estacionamiento al
  // formulario NO_SESSION/OTHER de la app de Inspectores (fuera del
  // alcance de esta tarea, que es la Administración, no la app de campo).
  let unassignedRows = [];
  if (context.role === ROLES.PLATFORM_ADMIN) {
    unassignedRows = fail(await db.from("on_street_inspections")
      .select("id,license_plate_normalized,session_id,qr_location_id,parking_id,inspector_user_id,inspection_type,vehicle_still_present,observations,latitude,longitude,inspected_at,sms_required,sms_status,sms_sent_at")
      .is("parking_id", null)
      .gte("inspected_at", bounds.from).lte("inspected_at", bounds.to)
      .order("inspected_at", { ascending: false })
      .limit(500));
  }

  const [locationMap, inspectorMap] = await Promise.all([
    locationNamesByQrId(db, rows.map((r) => r.qr_location_id)),
    inspectorEmailMap(db),
  ]);

  const withDetail = rows
    .map((row) => ({ ...row, location: locationMap.get(row.qr_location_id) || null, inspectorEmail: inspectorMap.get(row.inspector_user_id) || "—", unassigned: false }))
    .filter((row) => {
      if (input.parkingId && row.location?.parkingId !== input.parkingId) return false;
      if (input.areaId && row.location?.sectorId !== input.areaId) return false;
      if (input.streetId && row.location?.streetId !== input.streetId) return false;
      if (input.segmentId && row.location?.segmentId !== input.segmentId) return false;
      return true;
    });
  const unassignedDetail = unassignedRows.map((row) => ({ ...row, location: null, inspectorEmail: inspectorMap.get(row.inspector_user_id) || "—", unassigned: true }));

  // El filtro por lugar (parking/área/calle/tramo) nunca puede calzar con
  // un registro sin ubicación -- si el admin filtró por lugar, los
  // "unassigned" se omiten de la lista (no tiene sentido mostrarlos bajo
  // un filtro de lugar), pero unassignedCount se informa siempre por
  // separado para que platform_admin sepa que existen aunque el filtro
  // activo no los muestre.
  const placeFilterActive = Boolean(input.parkingId || input.areaId || input.streetId || input.segmentId);
  const allRows = placeFilterActive ? withDetail : [...withDetail, ...unassignedDetail];

  return { rows: allRows, bounds, kpis: computeInspectionKpis(allRows), unassignedCount: unassignedDetail.length };
}

// Actividad de un Inspector: sus propias fiscalizaciones, sin acotar por
// empresa (un Inspector opera globalmente, ver §22 del brief) -- solo
// Administrador llega a esta consulta (RBAC en la ruta API), nunca el
// propio Inspector.
export async function getInspectorActivity(db, inspectorUserId, limit = 200) {
  const rows = fail(await db.from("on_street_inspections")
    .select("id,license_plate_normalized,session_id,qr_location_id,inspection_type,vehicle_still_present,inspected_at,sms_required,sms_status")
    .eq("inspector_user_id", inspectorUserId)
    .order("inspected_at", { ascending: false })
    .limit(limit));
  const locationMap = await locationNamesByQrId(db, rows.map((r) => r.qr_location_id));
  return rows.map((row) => ({ ...row, location: locationMap.get(row.qr_location_id) || null }));
}
