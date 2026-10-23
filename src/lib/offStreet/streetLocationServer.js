// Datos de calle para el POS Off Street (SOL-2026-10-23-001, etapa 3). Recibe un
// cliente `db` server-side (service role) ya autorizado por el llamador.
import { activeOperatorAssignments, assignedSegmentIds, operationalClock, posStreetSegmentsView } from "./streetLocationCore.mjs";

const OCCUPYING_STATUSES = ["OPEN", "UNPAID_PENDING"];

// Zonas de calle, calles, tramos activos, ocupación por tramo y asignaciones del
// estacionamiento. Sin zonas de calle devuelve listas vacías (estacionamiento de recinto).
// Si la migración 20261023120000 aún no existe en el ambiente, se comporta igual.
export async function loadStreetLocationData(db, parkingId) {
  const empty = { sectors: [], streets: [], segments: [], occupancy: {}, assignments: [] };
  const sectorResult = await db.from("parking_sectors").select("id,name,status").eq("parking_id", parkingId).eq("structure_kind", "STREET").eq("status", "ACTIVE");
  if (sectorResult.error) {
    if (["42703", "PGRST204"].includes(sectorResult.error.code)) return empty;
    throw sectorResult.error;
  }
  const sectors = sectorResult.data || [];
  if (!sectors.length) return empty;
  const sectorIds = sectors.map((item) => item.id);
  const [streetResult, segmentResult, assignmentResult] = await Promise.all([
    db.from("parking_streets").select("id,name,sector_id,status").eq("parking_id", parkingId).in("sector_id", sectorIds).eq("status", "ACTIVE"),
    db.from("parking_street_segments").select("id,code,name,area_id,street_id,from_number,to_number,capacity,status").eq("parking_id", parkingId).in("area_id", sectorIds),
    db.from("operator_assignments").select("id,operator_id,sector_id,street_id,number_from,number_to,valid_from,valid_until,start_time,end_time,days_of_week,status").eq("parking_id", parkingId).in("sector_id", sectorIds),
  ]);
  for (const result of [streetResult, segmentResult, assignmentResult]) if (result.error) throw result.error;
  const streetIds = new Set((streetResult.data || []).map((item) => item.id));
  const segments = (segmentResult.data || []).filter((item) => streetIds.has(item.street_id));
  const occupancy = {};
  if (segments.length) {
    const stays = await db.from("parking_stays").select("segment_id").eq("parking_id", parkingId).in("segment_id", segments.map((item) => item.id)).in("status", OCCUPYING_STATUSES);
    if (stays.error) throw stays.error;
    for (const row of stays.data || []) occupancy[row.segment_id] = (occupancy[row.segment_id] || 0) + 1;
  }
  return { sectors, streets: streetResult.data || [], segments, occupancy, assignments: assignmentResult.data || [] };
}

// Vista del POS para el operador: tramos con cupo y cuáles le corresponden ahora.
export function streetLocationPosView(data, operatorId, now = new Date()) {
  const active = activeOperatorAssignments(data.assignments, operatorId, operationalClock(now));
  const assignedIds = assignedSegmentIds(data.segments, active);
  const segments = posStreetSegmentsView({ ...data, assignedIds });
  return { enabled: segments.length > 0, segments, defaultSegmentId: assignedIds[0] || null };
}
