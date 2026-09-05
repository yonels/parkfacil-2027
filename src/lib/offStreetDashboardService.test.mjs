import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { countOpenShifts, fetchMovementRows, getOffStreetDashboardOverview } from "./offStreetDashboardService.js";

// Mock genérico de query builder de Supabase -- mismo patrón consolidado de
// Fase 1 (head count) + Fase 2 (.range() real + .then() para lookups sin
// paginación), porque el orquestador real reutiliza getOperationsSummary
// (Fase 1) y getRevenueOverview/searchRevenueClosures (Fase 2) tal cual.
function createMockDb({ stays = [], shifts = [], closures = [] } = {}) {
  function builder(rows, table) {
    const predicates = [];
    let orderBy = null;
    let headCount = false;
    const api = {
      select(_columns, options) {
        if (options?.head) headCount = true;
        return api;
      },
      eq(field, value) { predicates.push((row) => row[field] === value); return api; },
      in(field, values) { const set = new Set(values); predicates.push((row) => set.has(row[field])); return api; },
      gte(field, value) { predicates.push((row) => row[field] >= value); return api; },
      lte(field, value) { predicates.push((row) => row[field] <= value); return api; },
      or(expr) {
        // Soporta tanto "field.ilike.%x%,..." (búsqueda, no usada aquí) como
        // "and(a.gte.X,a.lte.Y),and(b.gte.X,b.lte.Y)" (ventana de
        // ingreso/salida de fetchMovementRows). Split de nivel superior
        // consciente de paréntesis (las fechas ISO dentro de cada término
        // tienen puntos propios -- "2026-07-23T00:00:00.000Z" -- así que ni
        // el split superior ni el de cada término pueden partir por CUALQUIER
        // coma/punto, solo por los que están al nivel correcto).
        function splitTopLevel(input, separator) {
          const parts = [];
          let depth = 0;
          let current = "";
          for (const char of input) {
            if (char === "(") depth += 1;
            if (char === ")") depth -= 1;
            if (char === separator && depth === 0) { parts.push(current); current = ""; continue; }
            current += char;
          }
          parts.push(current);
          return parts;
        }
        const clauses = splitTopLevel(expr, ",").map((clause) => {
          const andMatch = clause.match(/^and\((.+)\)$/);
          if (andMatch) {
            const subclauses = splitTopLevel(andMatch[1], ",").map((sub) => {
              const match = sub.match(/^([a-zA-Z_]+)\.([a-z]+)\.(.+)$/);
              if (!match) return () => true;
              const [, field, op, value] = match;
              return (row) => (op === "gte" ? row[field] >= value : op === "lte" ? row[field] <= value : true);
            });
            return (row) => subclauses.every((fn) => fn(row));
          }
          const match = clause.match(/^([a-zA-Z_]+)\.([a-z]+)\.(.+)$/);
          if (!match) return () => false;
          const [, field, , pattern] = match;
          const needle = String(pattern || "").replace(/%/g, "").toLowerCase();
          return (row) => String(row[field] || "").toLowerCase().includes(needle);
        });
        predicates.push((row) => clauses.some((fn) => fn(row)));
        return api;
      },
      order(field, options) { orderBy = { field, ascending: options?.ascending !== false }; return api; },
      maybeSingle() {
        const data = rows.filter((row) => predicates.every((fn) => fn(row)));
        return Promise.resolve({ data: data[0] || null, error: null });
      },
      sortedMatches() {
        let data = rows.filter((row) => predicates.every((fn) => fn(row)));
        if (orderBy) {
          data = [...data].sort((a, b) => {
            const cmp = a[orderBy.field] < b[orderBy.field] ? -1 : a[orderBy.field] > b[orderBy.field] ? 1 : 0;
            return orderBy.ascending ? cmp : -cmp;
          });
        }
        return data;
      },
      range(from, to) {
        const page = api.sortedMatches().slice(from, to + 1);
        return Promise.resolve({ data: page, error: null });
      },
      then(resolve) {
        const data = api.sortedMatches();
        if (headCount) { resolve({ data: null, count: data.length, error: null }); return; }
        resolve({ data, error: null });
      },
    };
    return api;
  }
  return {
    from(table) {
      if (table === "parking_stays") return builder(stays, table);
      if (table === "operator_shifts") return builder(shifts, table);
      if (table === "shift_closures") return builder(closures, table);
      return builder([], table);
    },
  };
}

const CO1_PARKINGS = [
  { id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" },
  { id: "p-norte", code: "NTE", name: "Parking Norte", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" },
  { id: "p-via-publica", code: "VP1", name: "Vía Pública 1", companyId: "co-1", companyName: "Empresa Uno", type: "ON_STREET" },
];

const STAYS = [
  // p-centro: 1 dentro (OPEN), 1 pagada hoy
  { id: "s1", code: "TK-001", license_plate: "AAAA-11", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-24T15:00:00.000Z", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, payment_code: null, payment_shift_id: null },
  { id: "s2", code: "TK-002", license_plate: "BBBB-22", parking_id: "p-centro", status: "PAID", entry_at: "2026-07-24T13:00:00.000Z", exit_at: "2026-07-24T15:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1500, payment_code: "PAY-002", payment_shift_id: null },
  // p-norte: 1 pagada ayer
  { id: "s3", code: "TK-003", license_plate: "CCCC-33", parking_id: "p-norte", status: "PAID", entry_at: "2026-07-23T19:00:00.000Z", exit_at: "2026-07-23T21:00:00.000Z", exit_operator_id: "op-beto", exit_operator_name: "Beto", payment_method: "CARD", total_amount: 2550, payment_code: "PAY-003", payment_shift_id: null },
  // p-via-publica (ON STREET, mismo tenant): 1 dentro + 1 pagada -- NUNCA debe afectar ningún KPI Off Street.
  { id: "s4", code: "TK-004", license_plate: "DDDD-44", parking_id: "p-via-publica", status: "OPEN", entry_at: "2026-07-24T15:00:00.000Z", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, payment_code: null, payment_shift_id: null },
  { id: "s5", code: "TK-005", license_plate: "EEEE-55", parking_id: "p-via-publica", status: "PAID", entry_at: "2026-07-24T14:00:00.000Z", exit_at: "2026-07-24T16:00:00.000Z", exit_operator_id: "op-carla", exit_operator_name: "Carla", payment_method: "CASH", total_amount: 90000, payment_code: "PAY-005", payment_shift_id: null },
];

const SHIFTS = [
  { id: "shift-open-1", parking_id: "p-centro", status: "OPEN" },
  { id: "shift-closing-1", parking_id: "p-norte", status: "CLOSING" },
  { id: "shift-closed-1", parking_id: "p-centro", status: "CLOSED" },
  // Turno On Street abierto -- nunca debe sumar al conteo Off Street.
  { id: "shift-open-onstreet", parking_id: "p-via-publica", status: "OPEN" },
];

const CLOSURES = [
  { id: "c1", parking_id: "p-centro", parking_name: "Parking Centro", company_name: "Empresa Uno", operator_id: "op-ana", operator_name: "Ana", folio: "CT-1", actual_close_at: "2026-07-24T16:00:00Z", shift_date: "2026-07-24", paid_vehicles_count: 5, cancelled_vehicles_count: 0, pending_vehicles_count: 1, cash_amount: 1500, card_amount: 0, collected_amount: 1500, declared_cash_amount: 1400, cash_difference: -100, difference_observation: "Faltante", closure_status: "CONFIRMED", confirmed_by: "op-ana", confirmed_at: "2026-07-24T16:01:00Z" },
  // Cierre On Street -- nunca debe sumar a "cierres del período" ni a "diferencias de caja" Off Street.
  { id: "c2", parking_id: "p-via-publica", parking_name: "Vía Pública 1", company_name: "Empresa Uno", operator_id: "op-carla", operator_name: "Carla", folio: "CT-2", actual_close_at: "2026-07-24T16:00:00Z", shift_date: "2026-07-24", paid_vehicles_count: 20, cancelled_vehicles_count: 1, pending_vehicles_count: 0, cash_amount: 50000, card_amount: 0, collected_amount: 50000, declared_cash_amount: 40000, cash_difference: -10000, difference_observation: "Gran faltante", closure_status: "CONFIRMED", confirmed_by: "op-carla", confirmed_at: "2026-07-24T16:01:00Z" },
];

const NOW = new Date("2026-07-24T18:00:00.000Z"); // 14:00 Santiago 24/07

test("OPERACIÓN: reutiliza getOperationsSummary real (Fase 1) -- vehículos dentro y tickets abiertos vienen de status=OPEN", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { period: "today", now: NOW, capacity: 50 });
  assert.equal(result.operations.vehiculosDentro, 1); // solo s1 (p-centro), nunca s4 (On Street)
  assert.equal(result.operations.ticketsAbiertos, 1);
});

test("RECAUDACIÓN: reutiliza getRevenueOverview real (Fase 2) -- total/efectivo/tarjeta/transacciones/ticket promedio", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", now: NOW, capacity: 50 });
  assert.equal(result.revenue.summary.totalAmount, 1500 + 2550); // s2+s3, nunca s5 (On Street, $90.000)
  assert.equal(result.revenue.summary.count, 2);
});

test("OCUPACIÓN: capacidad (ya resuelta por el llamador) + vehículos dentro reales -> disponibles y % correctos", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { period: "today", now: NOW, capacity: 10 });
  assert.equal(result.occupancy.capacity, 10);
  assert.equal(result.occupancy.insideCount, 1);
  assert.equal(result.occupancy.available, 9);
  assert.equal(result.occupancy.occupancyPercentage, 10);
  assert.equal(result.occupancy.capacityKnown, true);
});

test("OCUPACIÓN: sin capacidad informada (0) -> capacityKnown=false, sin división por cero", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { period: "today", now: NOW, capacity: 0 });
  assert.equal(result.occupancy.capacityKnown, false);
  assert.equal(result.occupancy.available, null);
  assert.equal(result.occupancy.occupancyPercentage, null);
});

test("TURNOS: cuenta operator_shifts OPEN/CLOSING reales, nunca infiere por ausencia de cierre", async () => {
  const db = createMockDb({ shifts: SHIFTS });
  const count = await countOpenShifts(db, ["p-centro", "p-norte"]);
  assert.equal(count, 2); // shift-open-1 (OPEN) + shift-closing-1 (CLOSING); shift-closed-1 no cuenta
});

test("TURNOS: el conteo real excluye estacionamientos fuera del scope pasado (aislamiento por parkingIds explícito)", async () => {
  const db = createMockDb({ shifts: SHIFTS });
  const count = await countOpenShifts(db, ["p-centro"]);
  assert.equal(count, 1); // solo shift-open-1
});

test("CAJA: cierres del período y diferencia de caja provienen de shift_closures real (Fase 2), sin recalcular declarado-esperado", async () => {
  const db = createMockDb({ stays: STAYS, closures: CLOSURES });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", now: NOW, capacity: 50 });
  assert.equal(result.shifts.closuresInPeriod, 1); // solo c1 (Off Street); c2 es On Street
  assert.equal(result.revenue.cashDifference.totalDifference, -100); // nunca -10100 (que incluiría c2)
});

test("GRÁFICO: ingresos y salidas por día agrupan solo movimientos Off Street reales", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-23", dateTo: "2026-07-24", now: NOW, capacity: 50 });
  const day24 = result.dailyMovements.find((d) => d.date === "2026-07-24");
  const day23 = result.dailyMovements.find((d) => d.date === "2026-07-23");
  // 24/07: ingresos s1+s2 (p-centro) = 2 (nunca 3, que incluiría s4 On Street); salidas s2 = 1.
  assert.equal(day24.entries, 2);
  assert.equal(day24.exits, 1);
  // 23/07: ingreso s3 = 1; salida s3 = 1.
  assert.equal(day23.entries, 1);
  assert.equal(day23.exits, 1);
});

test("AISLAMIENTO OFF/ON STREET: ningún bloque (operación/recaudación/turnos/cierres/gráfico/ocupación) se altera por el parking On Street del mismo tenant", async () => {
  const db = createMockDb({ stays: STAYS, shifts: SHIFTS, closures: CLOSURES });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", now: NOW, capacity: 10 });
  assert.equal(result.operations.vehiculosDentro, 1);
  assert.equal(result.revenue.summary.totalAmount, 4050);
  assert.equal(result.shifts.closuresInPeriod, 1);
  assert.equal(result.revenue.cashDifference.totalDifference, -100);
  assert.ok(result.dailyMovements.every((day) => day.entries <= 2));
});

test("MULTI-TENANT: companyId fuera de scope no amplía -- devuelve estado vacío, no otra empresa", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { companyId: "co-inexistente", dateFrom: "2026-07-01", dateTo: "2026-07-31", now: NOW, capacity: 10 });
  assert.deepEqual(result.operations, { ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 });
  assert.equal(result.revenue.summary.totalAmount, 0);
});

test("MULTI-TENANT: parkingId On Street enviado manualmente se rechaza (nunca amplía a datos Off Street ni On Street)", async () => {
  const db = createMockDb({ stays: STAYS });
  await assert.rejects(
    () => getOffStreetDashboardOverview(db, CO1_PARKINGS, { parkingId: "p-via-publica" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("MULTI-TENANT: parkingId fuera de scope (otro tenant) se rechaza", async () => {
  const db = createMockDb({ stays: STAYS });
  await assert.rejects(
    () => getOffStreetDashboardOverview(db, CO1_PARKINGS, { parkingId: "p-inexistente" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("ESTADO VACÍO: empresa/parking sin movimientos ni cierres -- ceros reales, sin errores, sin restos", async () => {
  const db = createMockDb({ stays: [], shifts: [], closures: [] });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { parkingId: "p-norte", dateFrom: "2026-01-01", dateTo: "2026-01-02", now: NOW, capacity: 0 });
  assert.deepEqual(result.operations, { ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 });
  assert.equal(result.revenue.summary.totalAmount, 0);
  assert.equal(result.shifts.openShiftsCount, 0);
  assert.equal(result.shifts.closuresInPeriod, 0);
  assert.equal(result.occupancy.capacityKnown, false);
  assert.ok(result.dailyMovements.every((d) => d.entries === 0 && d.exits === 0));
});

test("ZONA HORARIA: un ingreso a las 22:00 hora Santiago cuenta en el día Santiago aunque su instante UTC ya sea el día calendario siguiente", async () => {
  // entry_at = 2026-07-24T02:00:00Z = 23-07-2026 22:00 America/Santiago
  // (Chile en UTC-4, invierno) -- mismo caso límite validado en Fase 1/2.
  const edgeStay = { id: "edge-1", code: "TK-EDGE", license_plate: "EDGE-01", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-24T02:00:00.000Z", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, payment_code: null, payment_shift_id: null };
  const db = createMockDb({ stays: [edgeStay] });
  const result = await getOffStreetDashboardOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-23", dateTo: "2026-07-23", now: NOW, capacity: 10 });
  const day23 = result.dailyMovements.find((d) => d.date === "2026-07-23");
  assert.equal(day23.entries, 1, "el ingreso de las 22:00 hora Santiago debe contar el 23/07 (día Santiago), no el 24/07 (día UTC)");
});

test("fetchMovementRows captura estadías que ENTRARON antes del rango pero SALIERON dentro de él (no solo por entry_at)", async () => {
  const stay = { id: "cross-1", code: "TK-CROSS", license_plate: "CRSS-01", parking_id: "p-centro", status: "PAID", entry_at: "2026-07-20T15:00:00.000Z", exit_at: "2026-07-24T15:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1000, payment_code: "PAY-CROSS", payment_shift_id: null };
  const db = createMockDb({ stays: [stay] });
  const rows = await fetchMovementRows(db, ["p-centro"], "2026-07-24", "2026-07-24");
  assert.equal(rows.length, 1, "una estadía que entró el 20/07 pero salió el 24/07 debe capturarse al consultar el rango 24/07");
});

test("el endpoint /api/dashboard-off-street reutiliza authorizeOperationRequest + REPORTS_READ (sin ampliar a OPERATIONS_USE) y resuelve el scope antes de consultar", async () => {
  const routeSource = await readFile(new URL("../app/api/dashboard-off-street/route.js", import.meta.url), "utf8");
  assert.match(routeSource, /authorizeOperationRequest\(request, PERMISSIONS\.REPORTS_READ\)/);
  assert.match(routeSource, /listParkings\(authorization\.db, authorization\.scope\)/);
  assert.match(routeSource, /getOffStreetDashboardOverview\(authorization\.db, scopedParkings,/);
  assert.match(routeSource, /getDashboardCapacity\(/);
  assert.match(routeSource, /operationAuthorizationError\(/);
  assert.doesNotMatch(routeSource, /PERMISSIONS\.OPERATIONS_USE/);
  assert.doesNotMatch(routeSource, /getSupabaseAdminClient|service_role/i);
});

test("offStreetDashboardCapacity usa getParkingStructure real (niveles/zonas), nunca parking_sectors.capacity ni un fallback demo", async () => {
  const source = await readFile(new URL("./offStreetDashboardCapacity.js", import.meta.url), "utf8");
  assert.match(source, /getParkingStructure\(/);
  // Se mencionan por nombre solo en comentarios explicando por qué NO se
  // usan (fallback demo) -- lo que no debe existir es una LLAMADA real.
  assert.doesNotMatch(source, /getDemoStructure\(|getStructurePageData\(/);
  assert.doesNotMatch(source, /\.from\(["']parking_sectors["']\)/);
});
