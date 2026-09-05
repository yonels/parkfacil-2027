import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { getMovementsSummary, getOpenCountsByParking, searchMovementsReport, searchShiftsReport } from "./offStreetReportsService.js";

// Mock genérico de query builder de Supabase -- mismo patrón consolidado de
// Fase 1 (head count) + Fase 2 (.range() real + .then() para lookups sin
// paginación) usado en offStreetDashboardService.test.mjs, porque este
// servicio reutiliza getOperationsSummary (Fase 1) y fetchAllMatchingRows
// (Fase 2) tal cual.
function createMockDb({ stays = [], shifts = [], members = [] } = {}) {
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
        const clauses = expr.split(",").map((clause) => {
          const match = clause.match(/^([a-zA-Z_]+)\.([a-z]+)\.(.+)$/);
          if (!match) return () => false;
          const [, field, op, value] = match;
          if (op === "eq") return (row) => row[field] === value;
          const needle = String(value || "").replace(/%/g, "").toLowerCase();
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
      if (table === "company_members") return builder(members, table);
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
  { id: "s1", code: "TK-001", license_plate: "AAAA-11", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-24T15:00:00.000Z", entry_operator_id: "op-ana", entry_operator_name: "Ana", entry_source: "WEB", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, entry_shift_id: "shift-1", payment_shift_id: null },
  { id: "s2", code: "TK-002", license_plate: "BBBB-22", parking_id: "p-centro", status: "PAID", entry_at: "2026-07-24T13:00:00.000Z", entry_operator_id: "op-ana", entry_operator_name: "Ana", entry_source: "POS", exit_at: "2026-07-24T15:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1500, entry_shift_id: "shift-1", payment_shift_id: "shift-1" },
  { id: "s3", code: "TK-003", license_plate: "CCCC-33", parking_id: "p-norte", status: "PAID", entry_at: "2026-07-23T19:00:00.000Z", entry_operator_id: "op-beto", entry_operator_name: "Beto", entry_source: "WEB", exit_at: "2026-07-23T21:00:00.000Z", exit_operator_id: "op-beto", exit_operator_name: "Beto", payment_method: "CARD", total_amount: 2550, entry_shift_id: null, payment_shift_id: null },
  // On Street (mismo tenant) -- nunca debe aparecer.
  { id: "s4", code: "TK-004", license_plate: "DDDD-44", parking_id: "p-via-publica", status: "OPEN", entry_at: "2026-07-24T15:00:00.000Z", entry_operator_id: "op-carla", entry_operator_name: "Carla", entry_source: "WEB", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, entry_shift_id: null, payment_shift_id: null },
];

const SHIFTS = [
  { id: "shift-1", operator_id: "op-ana", parking_id: "p-centro", shift_date: "2026-07-24", opened_at: "2026-07-24T12:00:00Z", closed_at: null, status: "OPEN" },
  { id: "shift-2", operator_id: "op-beto", parking_id: "p-norte", shift_date: "2026-07-23", opened_at: "2026-07-23T12:00:00Z", closed_at: "2026-07-23T22:00:00Z", status: "CLOSED" },
  // On Street -- nunca debe aparecer.
  { id: "shift-onstreet", operator_id: "op-carla", parking_id: "p-via-publica", shift_date: "2026-07-24", opened_at: "2026-07-24T12:00:00Z", closed_at: null, status: "OPEN" },
];

const MEMBERS = [{ user_id: "op-ana", full_name: "Ana Pérez" }, { user_id: "op-beto", full_name: "Beto Soto" }];

const NOW = new Date("2026-07-24T18:00:00.000Z");

test("MOVIMIENTOS: mapea con toOperationRow real (Fase 1), incluye elapsedMinutes, nunca incluye On Street", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchMovementsReport(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", now: NOW });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["s1", "s2", "s3"]);
  const s1 = result.rows.find((r) => r.id === "s1");
  assert.equal(s1.elapsedMinutes, 180); // 15:00 -> 18:00 = 180 min
  assert.equal(s1.parkingName, "Parking Centro");
});

test("VEHÍCULOS ESTACIONADOS: status=OPEN forzado solo lista estadías dentro, nunca inventa monto", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchMovementsReport(db, CO1_PARKINGS, { status: "OPEN", movement: "entries" });
  assert.deepEqual(result.rows.map((r) => r.id), ["s1"]);
  assert.equal(result.rows[0].amount, 0); // sin pago real todavía -- nunca se inventa
});

test("MOVIMIENTOS: resumen reutiliza getOperationsSummary real (Fase 1) -- paridad garantizada por construcción", async () => {
  const db = createMockDb({ stays: STAYS });
  const summary = await getMovementsSummary(db, CO1_PARKINGS, { now: NOW });
  assert.equal(summary.vehiculosDentro, 1); // s1, nunca s4 (On Street)
  assert.equal(summary.ticketsAbiertos, 1);
});

test("MOVIMIENTOS: filtro por operador (entrada o salida, por id real) funciona", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchMovementsReport(db, CO1_PARKINGS, { operatorId: "op-beto" });
  assert.deepEqual(result.rows.map((r) => r.id), ["s3"]);
});

test("MOVIMIENTOS: parkingId On Street enviado manualmente se rechaza (404)", async () => {
  const db = createMockDb({ stays: STAYS });
  await assert.rejects(
    () => searchMovementsReport(db, CO1_PARKINGS, { parkingId: "p-via-publica" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("TURNOS: lista operator_shifts reales con nombre de operador resuelto por lote (company_members), nunca On Street", async () => {
  const db = createMockDb({ shifts: SHIFTS, members: MEMBERS });
  const result = await searchShiftsReport(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["shift-1", "shift-2"]);
  const s1 = result.rows.find((r) => r.id === "shift-1");
  assert.equal(s1.operator, "Ana Pérez");
  assert.equal(s1.status, "OPEN");
});

test("TURNOS: cantidad de operaciones y recaudación del turno se resuelven por FK real (entry_shift_id/payment_shift_id), no por heurística", async () => {
  const db = createMockDb({ stays: STAYS, shifts: SHIFTS, members: MEMBERS });
  const result = await searchShiftsReport(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  const shift1 = result.rows.find((r) => r.id === "shift-1");
  assert.equal(shift1.entryCount, 2); // s1 y s2 tienen entry_shift_id=shift-1
  assert.equal(shift1.revenueAmount, 1500); // solo s2 está PAID con payment_shift_id=shift-1
  const shift2 = result.rows.find((r) => r.id === "shift-2");
  assert.equal(shift2.entryCount, 0);
  assert.equal(shift2.revenueAmount, 0);
});

test("TURNOS: filtro por estado real (OPEN/CLOSING/CLOSED) funciona", async () => {
  const db = createMockDb({ shifts: SHIFTS, members: MEMBERS });
  const result = await searchShiftsReport(db, CO1_PARKINGS, { status: "CLOSED" });
  assert.deepEqual(result.rows.map((r) => r.id), ["shift-2"]);
});

test("TURNOS: parkingId On Street enviado manualmente se rechaza (404)", async () => {
  const db = createMockDb({ shifts: SHIFTS });
  await assert.rejects(
    () => searchShiftsReport(db, CO1_PARKINGS, { parkingId: "p-via-publica" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("OCUPACIÓN: conteo de vehículos dentro agrupado por parking en una sola consulta, nunca On Street", async () => {
  const db = createMockDb({ stays: STAYS });
  const counts = await getOpenCountsByParking(db, ["p-centro", "p-norte"]);
  assert.equal(counts.get("p-centro"), 1); // s1
  assert.equal(counts.get("p-norte") || 0, 0);
  assert.equal(counts.has("p-via-publica"), false);
});

// ============================================================
// §11/§12/§13 del alcance: pruebas de PARIDAD explícita -- para el mismo
// fixture/filtro, el reporte debe producir EXACTAMENTE lo mismo que el
// servicio real de la fase correspondiente (no una reimplementación
// paralela que "coincidentemente" dé el mismo número).
// ============================================================

test("PARIDAD FASE 1: getMovementsSummary(reportes) === getOperationsSummary(Fase 1) para el mismo fixture", async () => {
  const { getOperationsSummary } = await import("./posStaysService.js");
  const { offStreetParkings } = await import("./offStreetRevenueService.js");
  const db = createMockDb({ stays: STAYS });

  const reportSummary = await getMovementsSummary(db, CO1_PARKINGS, { now: NOW });
  const directSummary = await getOperationsSummary(db, offStreetParkings(CO1_PARKINGS), { now: NOW });
  assert.deepEqual(reportSummary, directSummary);
});

test("PARIDAD FASE 3: el conteo de vehículos dentro por parking (reportes, Ocupación) coincide con la suma que ve el Dashboard para el mismo scope", async () => {
  const { getOperationsSummary } = await import("./posStaysService.js");
  const { offStreetParkings } = await import("./offStreetRevenueService.js");
  const db = createMockDb({ stays: STAYS });

  const counts = await getOpenCountsByParking(db, ["p-centro", "p-norte"]);
  const sumFromReport = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const dashboardSummary = await getOperationsSummary(db, offStreetParkings(CO1_PARKINGS), { now: NOW });
  assert.equal(sumFromReport, dashboardSummary.vehiculosDentro);
});

test("las rutas /api/reportes-off-street reutilizan authorizeOperationRequest + REPORTS_READ (sin ampliar a OPERATIONS_USE) y resuelven el scope antes de consultar", async () => {
  const routeSource = await readFile(new URL("../app/api/reportes-off-street/route.js", import.meta.url), "utf8");
  assert.match(routeSource, /authorizeOperationRequest\(request, PERMISSIONS\.REPORTS_READ\)/);
  assert.match(routeSource, /listParkings\(authorization\.db, authorization\.scope\)/);
  assert.match(routeSource, /searchMovementsReport\(authorization\.db, scopedParkings,/);
  assert.match(routeSource, /searchShiftsReport\(authorization\.db, scopedParkings,/);
  assert.match(routeSource, /getDashboardCapacityByParking\(/);
  assert.match(routeSource, /operationAuthorizationError\(/);
  assert.doesNotMatch(routeSource, /PERMISSIONS\.OPERATIONS_USE/);
  assert.doesNotMatch(routeSource, /getSupabaseAdminClient|service_role/i);
});

test("PARIDAD FASE 3: el reporte de Ocupación y el Dashboard resuelven la capacidad con la MISMA función (offStreetDashboardCapacity.js), nunca una regla paralela", async () => {
  const [reportsRoute, dashboardRoute] = await Promise.all([
    readFile(new URL("../app/api/reportes-off-street/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard-off-street/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(reportsRoute, /from ["']@\/lib\/offStreetDashboardCapacity["']/);
  assert.match(dashboardRoute, /from ["']@\/lib\/offStreetDashboardCapacity["']/);
  assert.doesNotMatch(reportsRoute, /resolveParkingCapacity\(/); // usa el resultado ya resuelto, no reimplementa la regla nivel/zona
});
