// Servicio de datos reales para el Dashboard Off Street (Fase 3). Orquesta
// Fase 1 (getOperationsSummary) y Fase 2 (getRevenueOverview/
// searchRevenueClosures) SIN recalcularlas -- solo agrega lo que todavía no
// existe: turnos actualmente abiertos y la serie diaria de ingresos/salidas
// (dominio de movimientos, no financiero). La capacidad real vive aparte
// (offStreetDashboardCapacity.js) porque su dependencia real
// (getParkingStructure) importa "server-only" y volvería este archivo
// intestable con mocks -- ver ese archivo para el porqué y la auditoría de
// capacidad completa.
import { fetchAllMatchingRows, getRevenueOverview, offStreetParkings, resolveQueryParkingIds, searchRevenueClosures } from "./offStreetRevenueService.js";
import { getOperationsSummary } from "./posStaysService.js";
import { addDaysToIsoDate } from "./pos/activityReportCore.mjs";
import { buildDailyMovementsSeries, computeOccupancy, resolveDashboardRange } from "./offStreetDashboardCore.mjs";

// Misma definición real de "turno actualmente abierto" que ya usa
// /api/estacionamientos/[id]/turnos (OPERATOR_SHIFT_CONFLICT: un operador no
// puede tener dos turnos OPEN/CLOSING a la vez) -- no se inventa un estado
// nuevo ni se infiere "abierto" solo por la ausencia de un cierre (§10).
const OPEN_SHIFT_STATUSES = ["OPEN", "CLOSING"];

async function countOpenShifts(db, parkingIds) {
  if (!parkingIds.length) return 0;
  const { count, error } = await db.from("operator_shifts").select("id", { count: "exact", head: true })
    .in("parking_id", parkingIds).in("status", OPEN_SHIFT_STATUSES);
  if (error) throw error;
  return count || 0;
}

// Filas mínimas de parking_stays para el gráfico "Ingresos y salidas por
// día" (§E.2) -- une (OR) estadías cuyo ingreso O salida cae en el rango
// (una estadía que entró antes del período y salió dentro de él también
// debe contar como salida ese día). Mismo mecanismo sin techo silencioso de
// Fase 2 (fetchAllMatchingRows + .range() real), nunca un límite oculto en
// 1000 filas.
async function fetchMovementRows(db, parkingIds, dateFrom, dateTo) {
  if (!parkingIds.length) return [];
  const from = `${addDaysToIsoDate(dateFrom, -1)}T00:00:00.000Z`;
  const to = `${addDaysToIsoDate(dateTo, 1)}T23:59:59.999Z`;
  const queryFactory = () => db.from("parking_stays").select("entry_at,exit_at").in("parking_id", parkingIds)
    .or(`and(entry_at.gte.${from},entry_at.lte.${to}),and(exit_at.gte.${from},exit_at.lte.${to})`)
    .order("entry_at", { ascending: false });
  return fetchAllMatchingRows(queryFactory);
}

function emptyOverview(dateFrom, dateTo) {
  return {
    operations: { ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 },
    revenue: { summary: { totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 }, dailySeries: [], cashDifference: { totalDifference: 0, closuresWithDifference: 0 } },
    shifts: { openShiftsCount: 0, closuresInPeriod: 0 },
    dailyMovements: [],
    occupancy: computeOccupancy({ capacity: 0, insideCount: 0 }),
    dateFrom,
    dateTo,
    parkings: [],
    companies: [],
  };
}

// Orquestador único del Dashboard Off Street. `capacity` llega YA resuelto
// por el llamador (getDashboardCapacity, offStreetDashboardCapacity.js) --
// esta función no toca getParkingStructure, para poder probarse con mocks
// de base de datos como el resto de Fase 1/2.
export async function getOffStreetDashboardOverview(db, scopedParkings, options = {}) {
  const { parkingId = null, companyId = null, period = null, dateFrom = null, dateTo = null, now = new Date(), capacity = 0, insideCountOverride = null } = options;

  const parkings = offStreetParkings(scopedParkings);
  const range = resolveDashboardRange({ period, dateFrom, dateTo, now });
  const { candidateParkings, queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });

  const parkingOptions = candidateParkings.map((parking) => ({ id: parking.id, code: parking.code, name: parking.name, companyId: parking.companyId, companyName: parking.companyName }));
  const companies = [...new Map(parkings.filter((p) => p.companyId).map((p) => [p.companyId, { id: p.companyId, name: p.companyName || "Empresa asociada" }])).values()];

  if (!queryParkingIds.length) {
    return { ...emptyOverview(range.dateFrom, range.dateTo), parkings: parkingOptions, companies };
  }

  const [operations, revenue, closuresPage, openShiftsCount, movementRows] = await Promise.all([
    getOperationsSummary(db, candidateParkings, { now }),
    getRevenueOverview(db, candidateParkings, { dateFrom: range.dateFrom, dateTo: range.dateTo, now }),
    searchRevenueClosures(db, candidateParkings, { dateFrom: range.dateFrom, dateTo: range.dateTo, pageSize: 1 }),
    countOpenShifts(db, queryParkingIds),
    fetchMovementRows(db, queryParkingIds, range.dateFrom, range.dateTo),
  ]);

  // El recorte exacto de día operacional (America/Santiago) ocurre dentro de
  // buildDailyMovementsSeries, fila por fila y por campo (entry_at/exit_at
  // independientes) -- fetchMovementRows solo acota la ventana ancha ±1 día
  // en UTC (mismo criterio que Fase 2) para no perder filas por el desfase
  // de huso horario.
  const dailyMovements = buildDailyMovementsSeries(movementRows, range.dateFrom, range.dateTo);

  // Ocupación (§A): capacidad declarada (ya resuelta por el llamador) +
  // vehículos dentro REALES y en vivo (operations.vehiculosDentro, Fase 1 --
  // nunca depende del período/filtro de fecha, es "ahora").
  const insideCount = insideCountOverride != null ? insideCountOverride : operations.vehiculosDentro;
  const occupancy = computeOccupancy({ capacity, insideCount });

  return {
    operations,
    revenue: { summary: revenue.summary, dailySeries: revenue.dailySeries, cashDifference: revenue.cashDifference },
    shifts: { openShiftsCount, closuresInPeriod: closuresPage.total },
    dailyMovements,
    occupancy,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    parkings: parkingOptions,
    companies,
  };
}

export { countOpenShifts, fetchMovementRows };
