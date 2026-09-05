// Lógica pura (sin acceso a base de datos) para el Dashboard Off Street
// (Fase 3). No recalcula nada que ya calculen Fase 1 (getOperationsSummary)
// o Fase 2 (getRevenueOverview/searchRevenueClosures) -- solo aporta lo que
// todavía no existe: resolución de período, ocupación/capacidad (protegida
// contra división por cero) y la serie diaria de ingresos/salidas (un
// dominio distinto al financiero de Fase 2: conteo de movimientos, no
// dinero).
import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "./dataEntry.mjs";
import { addDaysToIsoDate, operationalDateToIso } from "./pos/activityReportCore.mjs";

export const DASHBOARD_PERIODS = Object.freeze(["today", "7d", "month"]);

export function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateDashboardFilters({ dateFrom, dateTo, period } = {}) {
  if (period && !DASHBOARD_PERIODS.includes(period)) {
    return { ok: false, message: `period debe ser una de: ${DASHBOARD_PERIODS.join(", ")}.` };
  }
  if (dateFrom && !isValidIsoDate(dateFrom)) return { ok: false, message: "dateFrom debe tener formato AAAA-MM-DD." };
  if (dateTo && !isValidIsoDate(dateTo)) return { ok: false, message: "dateTo debe tener formato AAAA-MM-DD." };
  if (dateFrom && dateTo && dateFrom > dateTo) return { ok: false, message: "dateFrom no puede ser posterior a dateTo." };
  return { ok: true, message: "" };
}

export function operationalTodayIso(now = new Date(), timeZone = OPERATIONAL_TIME_ZONE) {
  return operationalDateToIso(toOperationalDateTimeParts(now, timeZone)?.entryDate);
}

// Resuelve el filtro "Período" (§4 del alcance: Hoy/7 días/Mes actual) al
// rango real dateFrom/dateTo -- un rango explícito (dateFrom/dateTo) siempre
// tiene prioridad sobre `period` (permite el "rango personalizado" que ya
// permite la infraestructura de Fase 2).
export function resolveDashboardRange({ period, dateFrom, dateTo, now = new Date() } = {}) {
  if (dateFrom || dateTo) {
    const today = operationalTodayIso(now);
    return { dateFrom: dateFrom || today, dateTo: dateTo || today };
  }
  const today = operationalTodayIso(now);
  if (period === "7d") return { dateFrom: addDaysToIsoDate(today, -6), dateTo: today };
  if (period === "month") return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
  return { dateFrom: today, dateTo: today }; // "today" (default)
}

// Ocupación (§A del alcance): capacidad declarada (getParkingStructure,
// niveles->zonas activas, ver offStreetDashboardService.mjs) + vehículos
// dentro REALES y en vivo (parking_stays.status='OPEN', Fase 1 -- nunca el
// campo `occupied` declarado de una zona, que es un valor manual de
// configuración, no operacional). Protegida contra división por cero: si no
// hay capacidad declarada (0 o ausente), se marca `capacityKnown: false` en
// vez de mostrar un 0%/Infinity engañoso.
export function computeOccupancy({ capacity = 0, insideCount = 0 } = {}) {
  const safeCapacity = Number.isFinite(capacity) ? Math.max(capacity, 0) : 0;
  const safeInside = Number.isFinite(insideCount) ? Math.max(insideCount, 0) : 0;
  const capacityKnown = safeCapacity > 0;
  return {
    capacity: safeCapacity,
    insideCount: safeInside,
    available: capacityKnown ? Math.max(safeCapacity - safeInside, 0) : null,
    occupancyPercentage: capacityKnown ? Math.round((safeInside / safeCapacity) * 100) : null,
    capacityKnown,
  };
}

// Serie diaria de ingresos/salidas (§E.2) -- agrupa por día operacional
// (America/Santiago) filas crudas de parking_stays ya acotadas por
// scope+rango (ver offStreetDashboardService.mjs). "Ingreso" cuenta por
// entry_at; "salida" cuenta por exit_at (solo estadías con salida real,
// status PAID o CANCELLED-con-salida no aplica ya que CANCELLED nunca tiene
// exit_at -- ver constraint real de parking_stays, Fase 2 §6). Devuelve
// TODOS los días del rango (incluidos los de actividad 0), orden ascendente.
export function buildDailyMovementsSeries(rows, dateFrom, dateTo, { timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  if (!dateFrom || !dateTo) return [];
  const entriesByDay = new Map();
  const exitsByDay = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const entryIso = operationalDateToIso(toOperationalDateTimeParts(row?.entry_at, timeZone)?.entryDate);
    if (entryIso && entryIso >= dateFrom && entryIso <= dateTo) {
      entriesByDay.set(entryIso, (entriesByDay.get(entryIso) || 0) + 1);
    }
    if (row?.exit_at) {
      const exitIso = operationalDateToIso(toOperationalDateTimeParts(row.exit_at, timeZone)?.entryDate);
      if (exitIso && exitIso >= dateFrom && exitIso <= dateTo) {
        exitsByDay.set(exitIso, (exitsByDay.get(exitIso) || 0) + 1);
      }
    }
  }
  const series = [];
  let cursor = dateFrom;
  let guard = 0;
  while (cursor <= dateTo && guard < 400) {
    series.push({ date: cursor, entries: entriesByDay.get(cursor) || 0, exits: exitsByDay.get(cursor) || 0 });
    cursor = addDaysToIsoDate(cursor, 1);
    guard += 1;
  }
  return series;
}

// AUDITORÍA DE CAPACIDAD (§8, corrección post-validación forense): la
// versión anterior leía structure.metrics.capacity (suma de TODAS las zonas
// del parking, ignorando por completo parking_levels.declared_capacity).
// Evidencia real que obliga a corregirlo:
//
// 1. parking_levels.declared_capacity es una columna real (migración
//    20260728203000_parking_level_declared_capacity.sql) y es EXACTAMENTE lo
//    que createLevel (parkingStructureRepository.js) escribe con el valor
//    que el admin ingresa al crear un nivel -- createLevel NUNCA crea una
//    zona. Un nivel recién creado (capacidad declarada, cero zonas) es un
//    estado real y válido, no una anomalía: mostrar "No informada" ahí sería
//    incorrecto (el admin SÍ declaró una capacidad real).
// 2. Cuando después se agregan zonas a un nivel (ruta
//    /api/estacionamientos/[id]/niveles/[nivelId]/zonas), la inserción NO
//    sincroniza ni valida contra declared_capacity (confirmado: la ruta de
//    creación de zona solo hace un INSERT plano, sin tocar parking_levels).
//    El dato real seed de Inmobiliaria 5Q (migración
//    20260729150000_5q_capacity_and_monthly_value.sql) confirma la intención
//    de diseño: level.declared_capacity=300 y su única zona capacity=300
//    representan la MISMA capacidad física en dos niveles de granularidad
//    (comentario real: "Zona inicial que representa la capacidad
//    contractual total... puede subdividirse en zonas operativas
//    conservando una capacidad total de 300 plazas") -- nunca se suman
//    ambas (300+300=600 sería inventar capacidad).
// 3. La tabla parkings NUNCA tuvo una columna de capacidad propia
//    (confirmado revisando cada "alter table public.parkings" real) -- no
//    existe un tercer nivel de fallback a nivel parking.
//
// REGLA DE PRIORIDAD (por nivel, agregada por parking) -- nunca simultánea:
//   capacidad(nivel) = suma de zonas ACTIVAS con capacity>0, SI existe al
//                      menos una; en caso contrario, declared_capacity del
//                      propio nivel.
//   capacidad(parking) = suma de capacidad(nivel) sobre niveles ACTIVOS.
// Esto cubre los 5 casos reales auditados:
//   1) nivel=100, 0 zonas               -> 100 (nunca "no informada")
//   2) nivel=100, zonas suman 100       -> 100 (nunca 200)
//   3) nivel1=100 + nivel2=50, 0 zonas  -> 150
//   4) capacidad propia de "parkings"   -> no existe en el esquema real
//   5) sin niveles/zonas/declared       -> 0 -> capacityKnown=false
export function resolveLevelCapacity(level) {
  const activeZones = (Array.isArray(level?.zones) ? level.zones : [])
    .filter((zone) => zone?.status === "ACTIVE" && Number(zone.capacity) > 0);
  if (activeZones.length > 0) {
    return activeZones.reduce((sum, zone) => sum + (Number(zone.capacity) || 0), 0);
  }
  return Number(level?.capacity) || 0;
}

// Reproyecta la capacidad real de un parking (getParkingStructure) aplicando
// la regla de prioridad nivel-por-nivel de arriba -- sin inventar una
// segunda fuente. Solo estructuras OFF_STREET tienen niveles/zonas; si
// getParkingStructure devolviera otra forma (nunca debería, ver
// offStreetDashboardCapacity.js), se trata como capacidad desconocida (0)
// en vez de lanzar.
export function resolveParkingCapacity(structure) {
  const levels = Array.isArray(structure?.levels) ? structure.levels : [];
  return levels
    .filter((level) => level?.status === "ACTIVE")
    .reduce((sum, level) => sum + resolveLevelCapacity(level), 0);
}
