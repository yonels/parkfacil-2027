import { computeOccupancy } from "./offStreetDashboardCore.mjs";

// Ocupación real de un estacionamiento Off Street (SOL-2026-11-04-012): capacidad
// de sus zonas activas y estadías abiertas, con la misma fórmula del Dashboard.
// parking_sectors.occupied y parking_zones.occupied son valores manuales, no autos.
export function liveOffStreetMetrics(baseMetrics, { capacity = 0, insideCount = 0 } = {}) {
  const occupancy = computeOccupancy({ capacity, insideCount });
  return {
    ...baseMetrics,
    capacity: occupancy.capacity,
    occupied: occupancy.insideCount,
    available: occupancy.available ?? 0,
    occupancyPercentage: occupancy.occupancyPercentage ?? 0,
  };
}

// On Street conserva sus métricas: se calculan con otra estructura.
export function applyLiveOccupancy(parkings = [], capacityByParking = [], openCounts = new Map()) {
  const capacities = new Map(capacityByParking.map((item) => [item.parkingId, item.capacity]));
  return parkings.map((parking) => parking.type === "OFF_STREET"
    ? { ...parking, metrics: liveOffStreetMetrics(parking.metrics, { capacity: capacities.get(parking.id) || 0, insideCount: openCounts.get(parking.id) || 0 }) }
    : parking);
}
