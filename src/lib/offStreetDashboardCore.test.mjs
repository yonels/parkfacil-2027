import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyMovementsSeries,
  computeOccupancy,
  operationalTodayIso,
  resolveDashboardRange,
  resolveLevelCapacity,
  resolveParkingCapacity,
  validateDashboardFilters,
} from "./offStreetDashboardCore.mjs";

test("validateDashboardFilters rechaza period/fechas fuera del modelo real", () => {
  assert.equal(validateDashboardFilters({}).ok, true);
  assert.equal(validateDashboardFilters({ period: "today" }).ok, true);
  assert.equal(validateDashboardFilters({ period: "year" }).ok, false);
  assert.equal(validateDashboardFilters({ dateFrom: "2026-07-05", dateTo: "2026-07-01" }).ok, false);
  assert.equal(validateDashboardFilters({ dateFrom: "05-07-2026" }).ok, false);
});

test("operationalTodayIso deriva 'hoy' de America/Santiago", () => {
  assert.equal(operationalTodayIso(new Date("2026-07-24T02:30:00.000Z")), "2026-07-23");
});

test("resolveDashboardRange: 'today' es hoy-hoy", () => {
  const range = resolveDashboardRange({ period: "today", now: new Date("2026-07-24T18:00:00Z") });
  assert.deepEqual(range, { dateFrom: "2026-07-24", dateTo: "2026-07-24" });
});

test("resolveDashboardRange: '7d' son los últimos 7 días operacionales (incluye hoy)", () => {
  const range = resolveDashboardRange({ period: "7d", now: new Date("2026-07-24T18:00:00Z") });
  assert.deepEqual(range, { dateFrom: "2026-07-18", dateTo: "2026-07-24" });
});

test("resolveDashboardRange: 'month' es el mes calendario actual hasta hoy", () => {
  const range = resolveDashboardRange({ period: "month", now: new Date("2026-07-24T18:00:00Z") });
  assert.deepEqual(range, { dateFrom: "2026-07-01", dateTo: "2026-07-24" });
});

test("resolveDashboardRange: un rango explícito (dateFrom/dateTo) tiene prioridad sobre period", () => {
  const range = resolveDashboardRange({ period: "today", dateFrom: "2026-06-01", dateTo: "2026-06-15", now: new Date("2026-07-24T18:00:00Z") });
  assert.deepEqual(range, { dateFrom: "2026-06-01", dateTo: "2026-06-15" });
});

test("resolveDashboardRange: dateFrom parcial completa el otro extremo con 'hoy'", () => {
  const range = resolveDashboardRange({ dateFrom: "2026-06-01", now: new Date("2026-07-24T18:00:00Z") });
  assert.deepEqual(range, { dateFrom: "2026-06-01", dateTo: "2026-07-24" });
});

test("computeOccupancy: capacidad real > 0 calcula disponibles y % correctamente", () => {
  const occ = computeOccupancy({ capacity: 100, insideCount: 42 });
  assert.equal(occ.available, 58);
  assert.equal(occ.occupancyPercentage, 42);
  assert.equal(occ.capacityKnown, true);
});

test("computeOccupancy: capacidad 0 o ausente -> capacityKnown=false, sin división por cero, sin 0% falso", () => {
  const zero = computeOccupancy({ capacity: 0, insideCount: 5 });
  assert.equal(zero.capacityKnown, false);
  assert.equal(zero.available, null);
  assert.equal(zero.occupancyPercentage, null);

  const missing = computeOccupancy({});
  assert.equal(missing.capacityKnown, false);
  assert.equal(missing.insideCount, 0);
});

test("computeOccupancy: vehículos dentro nunca deja disponibles negativos aunque supere la capacidad declarada", () => {
  const occ = computeOccupancy({ capacity: 10, insideCount: 15 });
  assert.equal(occ.available, 0);
  assert.equal(occ.occupancyPercentage, 150); // se muestra tal cual (sobre-ocupación real), no se oculta
});

// ============================================================
// CAPACIDAD (§8, corrección post-validación forense) -- 5 casos reales
// auditados contra createLevel/creación de zona/migraciones reales (ver
// comentario extenso en offStreetDashboardCore.mjs junto a
// resolveParkingCapacity). Regla: capacidad(nivel) = suma de zonas ACTIVAS
// con capacity>0 si existe al menos una, si no declared_capacity del propio
// nivel; capacidad(parking) = suma sobre niveles ACTIVOS. Nunca se suman
// ambas fuentes para el mismo nivel.
// ============================================================

test("CASO 1: nivel con capacidad declarada=100 y CERO zonas -> usa declared_capacity (100), nunca 'no informada'", () => {
  const structure = { levels: [{ status: "ACTIVE", capacity: 100, zones: [] }] };
  assert.equal(resolveParkingCapacity(structure), 100);
});

test("CASO 2: nivel con capacidad declarada=100 y zonas que suman 100 -> usa la suma de zonas (100), NUNCA 200 (nunca se suman ambas fuentes)", () => {
  const structure = { levels: [{ status: "ACTIVE", capacity: 100, zones: [{ status: "ACTIVE", capacity: 60 }, { status: "ACTIVE", capacity: 40 }] }] };
  assert.equal(resolveParkingCapacity(structure), 100);
});

test("CASO 3: dos niveles sin zonas (100 + 50) -> cada nivel cae a su declared_capacity -> total 150", () => {
  const structure = { levels: [
    { status: "ACTIVE", capacity: 100, zones: [] },
    { status: "ACTIVE", capacity: 50, zones: [] },
  ] };
  assert.equal(resolveParkingCapacity(structure), 150);
});

test("CASO 5: sin niveles (estructura vacía) -> capacidad 0", () => {
  assert.equal(resolveParkingCapacity({ levels: [] }), 0);
  assert.equal(resolveParkingCapacity(null), 0);
});

test("CASO 5b: nivel sin declared_capacity y sin zonas -> capacidad 0 para ese nivel", () => {
  const structure = { levels: [{ status: "ACTIVE", capacity: 0, zones: [] }] };
  assert.equal(resolveParkingCapacity(structure), 0);
});

test("niveles INACTIVOS/MAINTENANCE nunca aportan capacidad (mismo criterio que capacityMetrics real: solo ACTIVE)", () => {
  const structure = { levels: [
    { status: "ACTIVE", capacity: 100, zones: [] },
    { status: "INACTIVE", capacity: 999, zones: [] },
    { status: "MAINTENANCE", capacity: 999, zones: [] },
  ] };
  assert.equal(resolveParkingCapacity(structure), 100);
});

test("zonas INACTIVAS o con capacity<=0 no cuentan como 'el nivel tiene zonas' -> cae a declared_capacity igualmente", () => {
  const structure = { levels: [{ status: "ACTIVE", capacity: 100, zones: [{ status: "INACTIVE", capacity: 60 }, { status: "ACTIVE", capacity: 0 }] }] };
  assert.equal(resolveParkingCapacity(structure), 100); // ninguna zona activa con capacity>0 -> fallback al nivel
});

test("resolveLevelCapacity: zonas activas con capacity>0 tienen prioridad estricta sobre declared_capacity, incluso si difieren", () => {
  // Caso no cubierto por los datos reales (zonas y declared_capacity nunca
  // se sincronizan) pero la regla debe resolverlo sin ambigüedad: una vez
  // que el nivel tiene zonas activas reales, esas zonas SON la capacidad
  // operacional (más granular, más reciente).
  assert.equal(resolveLevelCapacity({ status: "ACTIVE", capacity: 999, zones: [{ status: "ACTIVE", capacity: 30 }] }), 30);
});

test("buildDailyMovementsSeries agrupa ingresos y salidas por día operacional, incluye días con actividad 0", () => {
  const rows = [
    { entry_at: "2026-07-23T15:00:00.000Z", exit_at: null }, // ingreso 23/07
    { entry_at: "2026-07-23T13:00:00.000Z", exit_at: "2026-07-24T14:00:00.000Z" }, // ingreso 23/07, salida 24/07
    { entry_at: "2026-07-24T15:00:00.000Z", exit_at: null }, // ingreso 24/07
  ];
  const series = buildDailyMovementsSeries(rows, "2026-07-22", "2026-07-24");
  assert.deepEqual(series.map((d) => d.date), ["2026-07-22", "2026-07-23", "2026-07-24"]);
  const day22 = series.find((d) => d.date === "2026-07-22");
  const day23 = series.find((d) => d.date === "2026-07-23");
  const day24 = series.find((d) => d.date === "2026-07-24");
  assert.deepEqual(day22, { date: "2026-07-22", entries: 0, exits: 0 });
  assert.equal(day23.entries, 2);
  assert.equal(day23.exits, 0);
  assert.equal(day24.entries, 1);
  assert.equal(day24.exits, 1);
});

test("buildDailyMovementsSeries: ZONA HORARIA -- un ingreso a las 22:00 Santiago cuenta en el día Santiago aunque su instante UTC ya sea el día calendario siguiente", () => {
  // 2026-07-24T02:00:00Z = 23-07-2026 22:00 America/Santiago (UTC-4, invierno).
  const rows = [{ entry_at: "2026-07-24T02:00:00.000Z", exit_at: null }];
  const series = buildDailyMovementsSeries(rows, "2026-07-23", "2026-07-23");
  assert.equal(series[0].entries, 1);
});

test("buildDailyMovementsSeries sin rango devuelve vacío", () => {
  assert.deepEqual(buildDailyMovementsSeries([{ entry_at: "2026-07-24T15:00:00.000Z" }], null, null), []);
});
