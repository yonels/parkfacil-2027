// Datos reales de los reportes por ubicación en calle (SOL-2026-10-23-001, etapa 4).
// Mismo scope que el resto de /reportes-off-street: el llamador entrega
// scopedParkings (listParkings con el scope de la sesión) y aquí se recorta con
// offStreetParkings/resolveQueryParkingIds (Fase 2), nunca una segunda resolución.
import { addDaysToIsoDate, filterRowsByExactOperationalDateRange } from "../pos/activityReportCore.mjs";
import { fetchAllMatchingRows, offStreetParkings, resolveQueryParkingIds } from "../offStreetRevenueService.js";
import { buildStreetIndex, summarizeStreetMovements, toSegmentOccupancyRow, toStreetMovementRow } from "./streetReportsCore.mjs";

const stayFields = "id,code,license_plate,parking_id,status,entry_at,entry_operator_id,entry_operator_name,entry_source,exit_at,exit_operator_name,elapsed_minutes,rate_name,total_amount,payment_method,sector_id,street_id,segment_id,street_number,out_of_assignment";
const OCCUPYING_STATUSES = ["OPEN", "UNPAID_PENDING"];

async function loadStructure(db, parkingIds) {
  const sectors = await db.from("parking_sectors").select("id,name,parking_id").in("parking_id", parkingIds).eq("structure_kind", "STREET");
  if (sectors.error) throw sectors.error;
  const sectorIds = (sectors.data || []).map((item) => item.id);
  if (!sectorIds.length) return { sectors: [], streets: [], segments: [] };
  const [streets, segments] = await Promise.all([
    db.from("parking_streets").select("id,name,sector_id,parking_id").in("sector_id", sectorIds),
    db.from("parking_street_segments").select("id,code,name,area_id,street_id,parking_id,from_number,to_number,capacity,status").in("area_id", sectorIds).order("from_number"),
  ]);
  if (streets.error) throw streets.error;
  if (segments.error) throw segments.error;
  return { sectors: sectors.data || [], streets: streets.data || [], segments: segments.data || [] };
}

function scope(scopedParkings, { parkingId, companyId }) {
  const parkings = offStreetParkings(scopedParkings);
  const { candidateParkings, queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });
  return {
    queryParkingIds,
    nameById: new Map(candidateParkings.map((p) => [p.id, p.name])),
    companyById: new Map(candidateParkings.map((p) => [p.id, p.companyName || ""])),
  };
}

// Ocupación actual por tramo (vehículos dentro: OPEN y UNPAID_PENDING).
export async function streetOccupancyReport(db, scopedParkings, { parkingId = null, companyId = null } = {}) {
  const { queryParkingIds, nameById, companyById } = scope(scopedParkings, { parkingId, companyId });
  if (!queryParkingIds.length) return { rows: [] };
  const structure = await loadStructure(db, queryParkingIds);
  const index = buildStreetIndex(structure);
  const occupied = {};
  if (structure.segments.length) {
    const stays = await fetchAllMatchingRows(() => db.from("parking_stays").select("id,segment_id").in("segment_id", structure.segments.map((item) => item.id)).in("status", OCCUPYING_STATUSES).order("id"));
    for (const row of stays) occupied[row.segment_id] = (occupied[row.segment_id] || 0) + 1;
  }
  const rows = structure.segments.map((segment) => toSegmentOccupancyRow(segment, { index, occupied: occupied[segment.id] || 0, parkingName: nameById.get(segment.parking_id) || "", companyName: companyById.get(segment.parking_id) || "" }));
  return { rows };
}

// Movimientos con ubicación en el período (por fecha de ingreso), opcionalmente
// solo los fuera de asignación o de un operador.
export async function streetMovementsReport(db, scopedParkings, { parkingId = null, companyId = null, dateFrom = null, dateTo = null, operatorId = null, outOfAssignmentOnly = false } = {}) {
  const { queryParkingIds, nameById, companyById } = scope(scopedParkings, { parkingId, companyId });
  if (!queryParkingIds.length) return { rows: [] };
  const structure = await loadStructure(db, queryParkingIds);
  if (!structure.segments.length) return { rows: [] };
  const index = buildStreetIndex(structure);
  const stays = await fetchAllMatchingRows(() => {
    let q = db.from("parking_stays").select(stayFields).in("parking_id", queryParkingIds).not("segment_id", "is", null);
    if (operatorId) q = q.eq("entry_operator_id", operatorId);
    if (outOfAssignmentOnly) q = q.eq("out_of_assignment", true);
    if (dateFrom) q = q.gte("entry_at", `${addDaysToIsoDate(dateFrom, -1)}T00:00:00.000Z`);
    if (dateTo) q = q.lte("entry_at", `${addDaysToIsoDate(dateTo, 1)}T23:59:59.999Z`);
    return q.order("entry_at", { ascending: false });
  });
  const exact = filterRowsByExactOperationalDateRange(stays, "entry_at", dateFrom, dateTo);
  const rows = exact.map((stay) => toStreetMovementRow(stay, { index, parkingName: nameById.get(stay.parking_id) || "", companyName: companyById.get(stay.parking_id) || "" }));
  return { rows };
}

// Resumen agrupado por zona, calle, tramo u operador.
export async function streetSummaryReport(db, scopedParkings, { groupBy = "segment", ...options } = {}) {
  const { rows } = await streetMovementsReport(db, scopedParkings, options);
  return { rows: summarizeStreetMovements(rows, groupBy) };
}
