import "server-only";
import { getParkingMetrics, getSectorMetrics } from "@/lib/estacionamientos.mjs";

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

export async function listParkings(supabase) {
  const [{ data: rows, error }, { data: sectorRows, error: sectorError }] = await Promise.all([
    supabase.from("parkings").select("*").order("code"),
    supabase.from("parking_sectors").select("*").order("code"),
  ]);
  if (error) throw error;
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

export async function getParking(supabase, identifier) {
  const parkings = await listParkings(supabase);
  const normalized = String(identifier || "").toUpperCase();
  return parkings.find((parking) => parking.id.toUpperCase() === normalized || parking.code.toUpperCase() === normalized) || null;
}
