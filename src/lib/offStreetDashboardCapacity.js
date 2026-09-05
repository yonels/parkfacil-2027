// Capacidad real declarada del Dashboard Off Street (§8 del alcance de
// Fase 3). Aislado en su propio archivo porque getParkingStructure importa
// "server-only" (vía parkingStructureRepository.js) -- igual que
// operationAuthorization.js en Fase 1, un módulo así no se puede importar
// directamente en node --test; mantenerlo mínimo (esta única función) deja
// el resto de la lógica del dashboard (offStreetDashboardService.js) libre
// de esa restricción y testeable con mocks de base de datos.
import "server-only";
import { getParkingStructure } from "./parkingStructureRepository.js";
import { resolveParkingCapacity } from "./offStreetDashboardCore.mjs";

// AUDITORÍA DE CAPACIDAD (§8): existen dos modelos de capacidad en el
// código -- (1) estacionamientosRepository.js/getParkingMetrics, basado en
// parking_sectors.capacity (genérico, histórico, usado hoy solo para
// identidad/scope en Fase 1/2, nunca leído para capacidad real); y (2)
// parkingStructureRepository.js/getParkingStructure, que para
// type==='OFF_STREET' resuelve niveles->zonas activas (parking_levels/
// parking_zones) -- la MISMA estructura que administran hoy los admins vía
// /estacionamientos/[id]/niveles/... (rutas reales confirmadas). Se elige
// (2) como única fuente de verdad -- nunca se suman ambos modelos ni se usa
// el (1) para este propósito.
//
// getParkingStructure NO tiene fallback demo (a diferencia de
// getStructurePageData/getDemoStructure, que sí lo tiene y por eso NO se usa
// aquí) -- un error real de base de datos se propaga tal cual, nunca se
// disfraza de estructura ficticia.
// Capacidad real por estacionamiento (Fase 4, reporte de Ocupación --
// necesita la fila por parking, no solo el total agregado). getDashboardCapacity
// (Fase 3) pasa a sumar este mismo resultado -- comportamiento idéntico,
// verificado por su propia suite de tests, sin duplicar la consulta.
export async function getDashboardCapacityByParking(db, offStreetParkingsInScope) {
  const parkings = Array.isArray(offStreetParkingsInScope) ? offStreetParkingsInScope : [];
  if (!parkings.length) return [];
  const structures = await Promise.all(parkings.map((parking) => getParkingStructure(db, parking)));
  return parkings.map((parking, index) => ({ parkingId: parking.id, capacity: resolveParkingCapacity(structures[index]) }));
}

export async function getDashboardCapacity(db, offStreetParkingsInScope) {
  const byParking = await getDashboardCapacityByParking(db, offStreetParkingsInScope);
  return byParking.reduce((sum, item) => sum + item.capacity, 0);
}
