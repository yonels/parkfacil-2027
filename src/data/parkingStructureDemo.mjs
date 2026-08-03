import { capacityMetrics, sectorDisplayName } from "../lib/parkingOperations.mjs";

const zones = [
  { id: "zone-001", levelId: "level-001", parkingId: "p-001", code: "A", name: "Zona A", status: "ACTIVE", capacity: 40, occupied: 25, description: "Área general", notes: "" },
  { id: "zone-002", levelId: "level-001", parkingId: "p-001", code: "VIS", name: "Zona Visitas", status: "ACTIVE", capacity: 20, occupied: 10, description: "Visitas", notes: "" },
  { id: "zone-003", levelId: "level-002", parkingId: "p-001", code: "VIP", name: "Zona VIP", status: "ACTIVE", capacity: 20, occupied: 11, description: "Acceso preferente", notes: "" },
];

export const levelsDemo = [
  { id: "level-001", parkingId: "p-001", code: "N-1", name: "Nivel -1", status: "ACTIVE", description: "Subterráneo", notes: "", zones: zones.filter((item) => item.levelId === "level-001") },
  { id: "level-002", parkingId: "p-001", code: "N1", name: "Nivel 1", status: "ACTIVE", description: "Nivel de acceso", notes: "", zones: zones.filter((item) => item.levelId === "level-002") },
];

export const streetsDemo = [
  { id: "street-001", parkingId: "p-002", sectorId: "on-sector-a", name: "Calle 80", district: "Norte", status: "ACTIVE", capacity: 36, occupied: 0, notes: "", segments: [{ id: "segment-nor-80-100-200", parkingId: "p-002", areaId: "on-sector-a", streetId: "street-001", code: "NOR-80-100-200", name: "Tramo 100–200", fromNumber: 100, toNumber: 200, streetSide: "BOTH", capacity: 36, occupiedSpaces: 0, occupied: 0, status: "ACTIVE", sortOrder: 1, notes: "" }] },
  { id: "street-002", parkingId: "p-002", sectorId: "on-sector-a", name: "Morandé", district: "Centro", status: "ACTIVE", capacity: 10, occupied: 5, notes: "" },
  { id: "street-003", parkingId: "p-002", sectorId: "on-sector-b", name: "Ahumada", district: "Sur", status: "ACTIVE", capacity: 60, occupied: 52, notes: "" },
];

export const onStreetSectorsDemo = [
  { id: "on-sector-a", parkingId: "p-002", code: "NOR", name: "Norte", status: "ACTIVE", description: "Área operacional norte", notes: "", streets: streetsDemo.filter((item) => item.sectorId === "on-sector-a") },
  { id: "on-sector-b", parkingId: "p-002", code: "SUR", name: "Sur", status: "ACTIVE", description: "Área operacional sur", notes: "", streets: streetsDemo.filter((item) => item.sectorId === "on-sector-b") },
].map((sector) => ({ ...sector, displayName: sectorDisplayName(sector), metrics: capacityMetrics(sector.streets) }));

export const assignmentsDemo = [
  { id: "assignment-001", parkingId: "p-002", sectorId: "on-sector-a", streetId: "street-001", operatorId: "u-001", operatorName: "Juan Pérez", numberFrom: 100, numberTo: 300, maxVehicles: 15, validFrom: "2026-07-01", validUntil: null, startTime: "08:00", endTime: "16:00", daysOfWeek: [1,2,3,4,5], status: "ACTIVE", supervisorId: null, notes: "" },
  { id: "assignment-002", parkingId: "p-002", sectorId: "on-sector-a", streetId: "street-001", operatorId: "u-002", operatorName: "Carlos Rojas", numberFrom: 301, numberTo: 500, maxVehicles: 10, validFrom: "2026-07-01", validUntil: null, startTime: "08:00", endTime: "16:00", daysOfWeek: [1,2,3,4,5], status: "ACTIVE", supervisorId: null, notes: "" },
];

export const shiftsDemo = [
  { id: "shift-demo-programmed", assignmentId: "assignment-001", operatorId: "u-001", parkingId: "p-002", sectorId: "on-sector-a", streetId: "street-001", date: "2026-07-28", scheduledStart: "08:00", scheduledEnd: "16:00", status: "PROGRAMMED", demo: true },
  { id: "shift-demo-closed", assignmentId: "assignment-002", operatorId: "u-002", parkingId: "p-002", sectorId: "on-sector-a", streetId: "street-001", date: "2026-07-27", scheduledStart: "08:00", scheduledEnd: "16:00", status: "CLOSED", demo: true, paymentInformationAvailable: false },
];

export function getDemoStructure(parking) {
  if (!parking) return null;
  if (parking.type === "OFF_STREET") {
    const levels = levelsDemo.filter((item) => item.parkingId === parking.id).map((level) => ({ ...level, metrics: capacityMetrics(level.zones) }));
    return { source: "demo", type: parking.type, levels, metrics: capacityMetrics(levels.filter((item) => item.status === "ACTIVE").flatMap((item) => item.zones)) };
  }
  const sectors = onStreetSectorsDemo.filter((item) => item.parkingId === parking.id);
  return { source: "demo", type: parking.type, sectors, assignments: assignmentsDemo.filter((item) => item.parkingId === parking.id), shifts: shiftsDemo.filter((item) => item.parkingId === parking.id), metrics: capacityMetrics(sectors.filter((item) => item.status === "ACTIVE").flatMap((item) => item.streets)) };
}
