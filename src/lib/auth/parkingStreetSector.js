import { requireParkingChild } from "@/lib/auth/parkingAuthorization";

// Zona de calle del estacionamiento. En Off Street (SOL-2026-10-23-001) solo las zonas
// STREET se administran por este flujo: el sector "O" automático de turnos y los
// sectores de recinto (PREMISES) no son visibles ni editables aquí.
export async function requireStreetSector(db, context, parking, sectorId) {
  return requireParkingChild(db, context, parking, "parking_sectors", sectorId, parking?.type === "OFF_STREET" ? { structure_kind: "STREET" } : {});
}
