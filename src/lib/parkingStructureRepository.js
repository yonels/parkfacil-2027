import "server-only";
import { capacityMetrics, sectorDisplayName } from "@/lib/parkingOperations.mjs";

const mapLevel = (row) => ({ id: row.id, parkingId: row.parking_id, code: row.code, name: row.name, displayName: `${row.code} · ${row.name}`, status: row.status, description: row.description || "", capacity: row.declared_capacity || 0, notes: row.notes || "" });
const mapZone = (row) => ({ id: row.id, parkingId: row.parking_id, levelId: row.level_id, code: row.code, name: row.name, status: row.status, capacity: row.capacity, occupied: row.occupied, description: row.description || "", notes: row.notes || "" });
const mapSector = (row) => ({ id: row.id, parkingId: row.parking_id, code: row.code, name: row.name, status: row.status, description: row.description || "", notes: row.notes || "", structureKind: row.structure_kind || "STREET" });
const mapStreet = (row) => ({ id: row.id, parkingId: row.parking_id, sectorId: row.sector_id, name: row.name, district: row.district || "", status: row.status, capacity: row.capacity, occupied: row.occupied, notes: row.notes || "" });
const mapSegment = (row) => ({ id: row.id, parkingId: row.parking_id, areaId: row.area_id, streetId: row.street_id, code: row.code, name: row.name, fromNumber: row.from_number, toNumber: row.to_number, streetSide: row.street_side, capacity: row.capacity, occupiedSpaces: row.occupied_spaces, occupied: row.occupied_spaces, status: row.status, sortOrder: row.sort_order, notes: row.notes || "" });

// Zonas de calle -> calles -> tramos + asignaciones de operador. En On Street son toda
// la estructura; en Off Street (SOL-2026-10-23-001) conviven con niveles y zonas de
// recinto y solo se leen las zonas de calle (structure_kind STREET): el sector "O"
// automático de turnos (PREMISES) y sus asignaciones base quedan fuera.
async function getStreetStructure(supabase, parking, { streetKindOnly }) {
  let sectorQuery = supabase.from("parking_sectors").select("id,parking_id,code,name,status,description,notes,structure_kind").eq("parking_id", parking.id).order("code");
  if (streetKindOnly) sectorQuery = sectorQuery.eq("structure_kind", "STREET");
  const [{ data: sectorRows, error }, { data: streetRows, error: streetError }, { data: segmentRows, error: segmentError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
    sectorQuery,
    supabase.from("parking_streets").select("*").eq("parking_id", parking.id).order("name"),
    supabase.from("parking_street_segments").select("*").eq("parking_id", parking.id).order("sort_order").order("from_number"),
    supabase.from("operator_assignments").select("*").eq("parking_id", parking.id).order("created_at"),
  ]);
  if (error) throw error;
  if (streetError) throw streetError;
  if (segmentError) throw segmentError;
  if (assignmentError) throw assignmentError;
  const sectorIds = new Set((sectorRows || []).map((row) => row.id));
  const sectors = (sectorRows || []).map(mapSector).map((sector) => {
    const streets = (streetRows || []).filter((row) => row.sector_id === sector.id).map(mapStreet).map((street) => {
      const segments = (segmentRows || []).filter((row) => row.street_id === street.id).map(mapSegment);
      const metrics = capacityMetrics(segments);
      return { ...street, segments, metrics, capacity: metrics.capacity, occupied: metrics.occupied };
    });
    // Off Street llama «Zona» a la zona de calle; On Street conserva «Área».
    const displayName = parking.type === "OFF_STREET" ? sectorDisplayName(sector).replace(/^Área /, "Zona ") : sectorDisplayName(sector);
    return { ...sector, displayName, streets, metrics: capacityMetrics(streets) };
  });
  const assignmentList = (assignmentRows || []).filter((row) => sectorIds.has(row.sector_id));
  // Nombre del operador para mostrar (operator_id es el user_id del miembro).
  const operatorIds = [...new Set(assignmentList.map((row) => row.operator_id).filter(Boolean))];
  let names = new Map();
  if (operatorIds.length) {
    const { data: members, error: memberError } = await supabase.from("company_members").select("user_id,full_name").in("user_id", operatorIds);
    if (memberError) throw memberError;
    names = new Map((members || []).map((member) => [String(member.user_id), member.full_name]));
  }
  const assignments = assignmentList.map((row) => ({ ...row, operator_name: names.get(String(row.operator_id)) || null }));
  return { sectors, assignments, metrics: capacityMetrics(sectors.filter((item) => item.status === "ACTIVE").flatMap((item) => item.streets).flatMap((item) => item.segments)) };
}

export async function getParkingStructure(supabase, parking) {
  if (parking.type === "OFF_STREET") {
    const [{ data: levelRows, error }, { data: zoneRows, error: zoneError }, street] = await Promise.all([
      supabase.from("parking_levels").select("*").eq("parking_id", parking.id).order("code"),
      supabase.from("parking_zones").select("*").eq("parking_id", parking.id).order("code"),
      getStreetStructure(supabase, parking, { streetKindOnly: true }),
    ]);
    if (error) throw error;
    if (zoneError) throw zoneError;
    const levels = (levelRows || []).map(mapLevel).map((level) => {
      const zones = (zoneRows || []).filter((row) => row.level_id === level.id).map(mapZone);
      return { ...level, zones, metrics: capacityMetrics(zones) };
    });
    return { source: "supabase", type: parking.type, levels, sectors: street.sectors, assignments: street.assignments, streetMetrics: street.metrics, metrics: capacityMetrics(levels.filter((item) => item.status === "ACTIVE").flatMap((item) => item.zones)) };
  }

  const street = await getStreetStructure(supabase, parking, { streetKindOnly: false });
  return { source: "supabase", type: parking.type, sectors: street.sectors, assignments: street.assignments, metrics: street.metrics };
}

export const levelInput = (input, parkingId) => ({ parking_id: parkingId, code: input.code, name: input.name, status: input.status, description: input.description || "", notes: input.notes || "" });
export const levelUpdateInput = (input) => ({ name: input.name, status: input.status, description: input.description || "", declared_capacity: input.capacity });
export async function createLevel(supabase, input, parkingId) {
  const { data, error } = await supabase.rpc("create_parking_level", {
    p_parking_id: parkingId,
    p_name: input.name,
    p_status: input.status,
    p_description: input.description,
    p_notes: "",
  });
  if (error) throw error;
  const created = Array.isArray(data) ? data[0] : data;
  const { data: updated, error: updateError } = await supabase.from("parking_levels").update({ declared_capacity: input.capacity }).eq("id", created.id).eq("parking_id", parkingId).select("*").single();
  if (updateError) throw updateError;
  return updated;
}
export const zoneInput = (input, parkingId, levelId) => ({ parking_id: parkingId, level_id: levelId, code: input.code, name: input.name, status: input.status, capacity: input.capacity, occupied: input.occupied, description: input.description || "", notes: input.notes || "" });
// Las zonas creadas desde este flujo son siempre de calle (On Street, y Off Street desde SOL-2026-10-23-001).
export const sectorInput = (input, parkingId) => ({ parking_id: parkingId, code: input.code, name: input.name, status: input.status, description: input.description || "", notes: input.notes || "", type: null, capacity: null, occupied: 0, structure_kind: "STREET" });
export const streetInput = (input, parkingId, sectorId) => ({ parking_id: parkingId, sector_id: sectorId, name: input.name, district: input.district || "", status: input.status, capacity: input.capacity, occupied: input.occupied, notes: input.notes || "" });
