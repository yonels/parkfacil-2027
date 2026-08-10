import "server-only";
import { getParking } from "@/lib/estacionamientosRepository";
import { buildConfigurator } from "@/lib/parkingConfigurator.mjs";

function unavailable(error) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

async function rows(db, table, parkingId, select = "*") {
  const result = await db.from(table).select(select).eq("parking_id", parkingId);
  if (result.error) throw result.error;
  return result.data || [];
}

export async function getConfigurator(db, identifier, { parking: authorizedParking = null, scope = {} } = {}) {
  const parking = authorizedParking || await getParking(db, identifier, scope);
  if (!parking) return null;
  const summary = { levelCount: 0, zoneCount: 0, sectorCount: 0, streetCount: 0, segmentCount: 0, capacity: 0, occupied: 0, assignmentCount: 0, shiftCount: 0, pendingClosureCount: 0, rateCount: 0 };
  const availability = { rates: false, operators: false, shifts: false, closures: false };
  const now = Date.now();
  try {
    if (parking.type === "OFF_STREET") {
      const [levels, zones, shifts] = await Promise.all([
        rows(db, "parking_levels", parking.id, "id,status"),
        rows(db, "parking_zones", parking.id, "id,status,capacity,occupied"),
        rows(db, "operator_shifts", parking.id, "id,status"),
      ]);
      const active = zones.filter((item) => item.status === "ACTIVE");
      summary.levelCount = levels.length;
      summary.zoneCount = zones.length;
      summary.capacity = active.reduce((sum, item) => sum + Number(item.capacity || 0), 0);
      summary.occupied = active.reduce((sum, item) => sum + Number(item.occupied || 0), 0);
      summary.shiftCount = shifts.length;
      availability.shifts = true;
      availability.closures = true;
    } else {
      const [sectors, streets, segments, assignments, shifts] = await Promise.all([
        rows(db, "parking_sectors", parking.id, "id,status"),
        rows(db, "parking_streets", parking.id, "id,status"),
        rows(db, "parking_street_segments", parking.id, "id,status,capacity,occupied_spaces"),
        rows(db, "operator_assignments", parking.id, "id,status"),
        rows(db, "operator_shifts", parking.id, "id,status"),
      ]);
      const active = segments.filter((item) => item.status === "ACTIVE");
      summary.sectorCount = sectors.length;
      summary.streetCount = streets.length;
      summary.segmentCount = segments.length;
      summary.capacity = active.reduce((sum, item) => sum + Number(item.capacity || 0), 0);
      summary.occupied = active.reduce((sum, item) => sum + Number(item.occupied_spaces || 0), 0);
      summary.assignmentCount = assignments.length;
      summary.shiftCount = shifts.length;
      availability.operators = true;
      availability.shifts = true;
      availability.closures = true;
    }
    const rates = await rows(db, "parking_rates", parking.id, "id,status,valid_from,valid_until");
    summary.rateCount = rates.filter((item) => {
      if (item.status !== "ACTIVE") return false;
      const from = item.valid_from ? new Date(item.valid_from).getTime() : Number.NEGATIVE_INFINITY;
      const until = item.valid_until ? new Date(item.valid_until).getTime() : Number.POSITIVE_INFINITY;
      return Number.isFinite(from) && from <= now && until > now;
    }).length;
    availability.rates = true;
  } catch (error) {
    if (!unavailable(error)) throw error;
    error.configuratorCode = "CONFIGURATION_SCHEMA_UNAVAILABLE";
    throw error;
  }
  summary.available = Math.max(summary.capacity - summary.occupied, 0);
  summary.occupancyPercentage = summary.capacity ? Math.round(summary.occupied / summary.capacity * 100) : 0;
  return buildConfigurator(parking, summary, availability);
}
