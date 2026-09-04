import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { getOperationStayById, getOperationsSummary, searchOperationStays } from "./posStaysService.js";

// Mock genérico de query builder de Supabase (mismo patrón que
// createReportMockDb en posStaysService.test.mjs): parking_stays/
// operator_shifts son listas en memoria, los filtros (.eq/.in/.gte/.lte) se
// acumulan y se resuelven al hacer `await`/`.then()` sobre el builder.
function createMockDb({ stays = [], shifts = [] } = {}) {
  function builder(rows) {
    const predicates = [];
    let orderBy = null;
    let limitTo = null;
    let headCount = false;
    const api = {
      select(_columns, options) {
        // Mismo contrato que supabase-js: select("id", { count: "exact",
        // head: true }) no trae filas, solo el conteo -- usado por el KPI
        // "vehículos dentro" (ver getOperationsSummary) para no transferir
        // el cuerpo de cada fila OPEN solo para contarlas.
        if (options?.head) headCount = true;
        return api;
      },
      eq(field, value) { predicates.push((row) => row[field] === value); return api; },
      in(field, values) { const set = new Set(values); predicates.push((row) => set.has(row[field])); return api; },
      gte(field, value) { predicates.push((row) => row[field] >= value); return api; },
      lte(field, value) { predicates.push((row) => row[field] <= value); return api; },
      or(expr) {
        // "license_plate.ilike.%X%,code.ilike.%X%" -- solo lo necesario para el test.
        const clauses = expr.split(",").map((clause) => {
          const [field, , pattern] = clause.split(".");
          const needle = pattern.replace(/%/g, "").toLowerCase();
          return (row) => String(row[field] || "").toLowerCase().includes(needle);
        });
        predicates.push((row) => clauses.some((fn) => fn(row)));
        return api;
      },
      order(field, options) { orderBy = { field, ascending: options?.ascending !== false }; return api; },
      limit(n) { limitTo = n; return api; },
      maybeSingle() {
        const data = rows.filter((row) => predicates.every((fn) => fn(row)));
        return Promise.resolve({ data: data[0] || null, error: null });
      },
      then(resolve) {
        let data = rows.filter((row) => predicates.every((fn) => fn(row)));
        if (headCount) { resolve({ data: null, count: data.length, error: null }); return; }
        if (orderBy) {
          data = [...data].sort((a, b) => {
            const cmp = a[orderBy.field] < b[orderBy.field] ? -1 : a[orderBy.field] > b[orderBy.field] ? 1 : 0;
            return orderBy.ascending ? cmp : -cmp;
          });
        }
        if (limitTo != null) data = data.slice(0, limitTo);
        resolve({ data, error: null });
      },
    };
    return api;
  }
  return {
    from(table) {
      if (table === "parking_stays") return builder(stays);
      if (table === "operator_shifts") return builder(shifts);
      return builder([]);
    },
  };
}

const CO1_PARKINGS = [
  { id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno" },
  { id: "p-norte", code: "NTE", name: "Parking Norte", companyId: "co-1", companyName: "Empresa Uno" },
];
const ALL_PARKINGS = [
  ...CO1_PARKINGS,
  { id: "p-otra-empresa", code: "OTR", name: "Parking Otra", companyId: "co-2", companyName: "Empresa Dos" },
];

const STAYS = [
  { id: "s1", code: "TK-001", license_plate: "AAAA-11", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-24T15:00:00.000Z", exit_at: null, payment_method: null, total_amount: null, entry_operator_name: "Ana", entry_source: "WEB" },
  { id: "s2", code: "TK-002", license_plate: "BBBB-22", parking_id: "p-centro", status: "PAID", entry_at: "2026-07-23T20:00:00.000Z", exit_at: "2026-07-23T22:00:00.000Z", payment_method: "CASH", total_amount: 1590, entry_operator_name: "Ana", exit_operator_name: "Beto", entry_source: "POS" },
  { id: "s3", code: "TK-003", license_plate: "CCCC-33", parking_id: "p-norte", status: "PAID", entry_at: "2026-07-23T21:00:00.000Z", exit_at: "2026-07-23T23:00:00.000Z", payment_method: "CARD", total_amount: 2550, entry_operator_name: "Carla", exit_operator_name: "Beto", entry_source: "WEB" },
  { id: "s4", code: "TK-004", license_plate: "DDDD-44", parking_id: "p-centro", status: "CANCELLED", entry_at: "2026-07-22T15:00:00.000Z", exit_at: null, payment_method: null, total_amount: null, entry_operator_name: "Ana", entry_source: "WEB" },
  // otra empresa: presente en la "BD" pero su parking nunca está en CO1_PARKINGS.
  { id: "s5", code: "TK-005", license_plate: "EEEE-55", parking_id: "p-otra-empresa", status: "OPEN", entry_at: "2026-07-24T15:00:00.000Z", exit_at: null, payment_method: null, total_amount: null, entry_operator_name: "Root", entry_source: "WEB" },
];

test("AISLAMIENTO: searchOperationStays nunca devuelve estadías de un parking fuera de scopedParkings", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchOperationStays(db, CO1_PARKINGS, { status: "OPEN" });
  assert.deepEqual(result.rows.map((row) => row.id), ["s1"]);
  assert.ok(result.parkings.every((parking) => parking.id !== "p-otra-empresa"));
  assert.ok(result.companies.every((company) => company.id !== "co-2"));
});

test("AISLAMIENTO: sin parkings resueltos (operador sin asignaciones) -> vacío, nunca el universo completo", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchOperationStays(db, [], {});
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.parkings, []);
});

test("AISLAMIENTO: operador acotado a un único parking (p-centro) no puede obtener filas ni el detalle de otro parking de la MISMA empresa (p-norte)", async () => {
  // Simula exactamente lo que parkingQueryScope(context, assignedParkingIds)
  // produce para ROLES.OPERATOR: listParkings(db, scope) ya habría devuelto
  // solo p-centro (nunca p-norte, aunque ambos sean de la misma empresa) --
  // este test pasa ese scope ya angosto, como lo haría la ruta real.
  const OPERATOR_SCOPE = [CO1_PARKINGS[0]]; // solo p-centro
  const db = createMockDb({ stays: STAYS });

  const list = await searchOperationStays(db, OPERATOR_SCOPE, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.ok(list.rows.every((row) => row.parkingId === "p-centro"));
  assert.ok(!list.rows.some((row) => row.id === "s3")); // s3 es de p-norte

  const detail = await getOperationStayById(db, OPERATOR_SCOPE, "s3"); // s3 pertenece a p-norte, fuera del scope del operador
  assert.equal(detail, null);
});

test("MANIPULACIÓN companyId: pedir un companyId fuera de scopedParkings nunca amplía el acceso -- devuelve vacío, no datos de otra empresa", async () => {
  const db = createMockDb({ stays: STAYS });
  // Un company_admin de co-1 (scopedParkings = CO1_PARKINGS, co-2 NUNCA
  // llega ni siquiera resuelto por listParkings) intenta forzar companyId
  // "co-2" por querystring -- no hay ningún parking de co-2 en scopedParkings
  // para filtrar, así que el resultado es vacío, nunca el universo de co-2.
  const result = await searchOperationStays(db, CO1_PARKINGS, { companyId: "co-2", dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.parkings, []);
});

test("AISLAMIENTO: parkingId fuera del scope se rechaza como recurso no encontrado", async () => {
  const db = createMockDb({ stays: STAYS });
  await assert.rejects(
    () => searchOperationStays(db, CO1_PARKINGS, { parkingId: "p-otra-empresa" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("FILTRO empresa: companyId acota los estacionamientos candidatos aunque scopedParkings tenga varias empresas (caso Root)", async () => {
  const db = createMockDb({ stays: STAYS });
  // Rango explícito (evita el default de "últimos 7 días" relativo a la
  // fecha real del sistema, irrelevante para este fixture fijo en julio).
  const result = await searchOperationStays(db, ALL_PARKINGS, { companyId: "co-2", dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows.map((row) => row.id), ["s5"]);
});

test("FILTRO estado: solo status=OPEN cuenta como vehículo dentro / ticket abierto", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchOperationStays(db, CO1_PARKINGS, { status: "OPEN" });
  assert.deepEqual(result.rows.map((row) => row.id), ["s1"]);
});

test("BÚSQUEDA por patente funciona", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchOperationStays(db, CO1_PARKINGS, { query: "bbbb-22" });
  assert.deepEqual(result.rows.map((row) => row.id), ["s2"]);
});

test("BÚSQUEDA por ticket funciona", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchOperationStays(db, CO1_PARKINGS, { query: "TK-003" });
  assert.deepEqual(result.rows.map((row) => row.id), ["s3"]);
});

test("FILTRO estacionamiento: acota a un único parking dentro del scope", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchOperationStays(db, CO1_PARKINGS, { parkingId: "p-norte", dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows.map((row) => row.id), ["s3"]);
  assert.ok(result.rows.every((row) => row.parkingId === "p-norte"));
});

test("paginación: total refleja el universo filtrado, rows solo la página pedida", async () => {
  const db = createMockDb({ stays: STAYS });
  const page1 = await searchOperationStays(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", pageSize: 2, page: 1 });
  assert.equal(page1.rows.length, 2);
  assert.equal(page1.total, 4); // s1,s2,s4 (p-centro) + s3 (p-norte)
});

test("KPI: estadía OPEN aparece como vehículo dentro / ticket abierto en el resumen", async () => {
  const db = createMockDb({ stays: STAYS });
  const summary = await getOperationsSummary(db, CO1_PARKINGS, { now: new Date("2026-07-24T18:00:00.000Z") });
  assert.equal(summary.vehiculosDentro, 1); // s1
  assert.equal(summary.ticketsAbiertos, 1);
});

test("KPI: estadía pagada/salida aparece como salida del día operacional real, no de otra empresa", async () => {
  const db = createMockDb({ stays: STAYS });
  const summary = await getOperationsSummary(db, CO1_PARKINGS, { now: new Date("2026-07-23T23:00:00.000Z") });
  assert.equal(summary.salidasDia, 2); // s2, s3 -- ambas salieron el 23/07 en Santiago
});

test("KPI: nunca cuenta estadías de otra empresa", async () => {
  const db = createMockDb({ stays: STAYS });
  const summary = await getOperationsSummary(db, CO1_PARKINGS, { now: new Date("2026-07-24T18:00:00.000Z") });
  // s5 es OPEN pero de "p-otra-empresa" -- si se colara, vehiculosDentro sería 2.
  assert.equal(summary.vehiculosDentro, 1);
});

test("ZONA HORARIA (borde real 20:00-24:00 Chile): un ingreso a las 22:00 hora de Santiago cuenta como 'hoy' aunque su instante UTC ya sea el día calendario siguiente", async () => {
  // entry_at = 2026-07-24T02:00:00Z = 23-07-2026 22:00 en America/Santiago
  // (Chile está en UTC-4 en julio, invierno). Su día UTC es 24/07, pero su
  // día operacional real (Santiago) es 23/07.
  const stay = { id: "edge-1", code: "TK-EDGE", license_plate: "EDGE-01", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-24T02:00:00.000Z", exit_at: null, payment_method: null, total_amount: null, entry_operator_name: "Ana", entry_source: "WEB" };
  const db = createMockDb({ stays: [stay] });
  // "now" = 2026-07-23T20:00:00Z = 23-07-2026 16:00 en Santiago -- MISMO día
  // Santiago que el ingreso (23/07), pero DISTINTO día UTC (23/07 vs 24/07
  // del entry_at). Si el cálculo usara el día UTC en vez de America/Santiago,
  // este ingreso quedaría excluido de "hoy" por error.
  const summary = await getOperationsSummary(db, CO1_PARKINGS, { now: new Date("2026-07-23T20:00:00.000Z") });
  assert.equal(summary.ingresosDia, 1, "el ingreso de las 22:00 hora Santiago debe contar como 'hoy' (día Santiago), no quedar excluido por el desfase UTC");
});

test("ZONA HORARIA: el mismo ingreso NO cuenta como 'hoy' una vez que también cambió el día calendario en Santiago (no solo en UTC)", async () => {
  const stay = { id: "edge-1", code: "TK-EDGE", license_plate: "EDGE-01", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-24T02:00:00.000Z", exit_at: null, payment_method: null, total_amount: null, entry_operator_name: "Ana", entry_source: "WEB" };
  const db = createMockDb({ stays: [stay] });
  // "now" = 2026-07-25T14:00:00Z = 25-07-2026 10:00 en Santiago -- ya es
  // "pasado mañana" en Santiago respecto del ingreso (23/07); no debe contar.
  const summary = await getOperationsSummary(db, CO1_PARKINGS, { now: new Date("2026-07-25T14:00:00.000Z") });
  assert.equal(summary.ingresosDia, 0);
});

test("DETALLE: /operacion/[id] carga un registro real autorizado", async () => {
  const db = createMockDb({ stays: STAYS });
  const detail = await getOperationStayById(db, CO1_PARKINGS, "s2");
  assert.equal(detail.ticket, "TK-002");
  assert.equal(detail.plate, "BBBB-22");
  assert.equal(detail.company.name, "Empresa Uno");
  assert.equal(detail.parking.name, "Parking Centro");
});

test("DETALLE: un registro de otro tenant no es accesible aunque se conozca su id", async () => {
  const db = createMockDb({ stays: STAYS });
  const detail = await getOperationStayById(db, CO1_PARKINGS, "s5");
  assert.equal(detail, null);
});

test("DETALLE: resuelve el turno asociado real cuando la estadía tiene entry_shift_id/payment_shift_id", async () => {
  const stayWithShift = { ...STAYS[1], entry_shift_id: "shift-1", payment_shift_id: "shift-1" };
  const db = createMockDb({ stays: [stayWithShift], shifts: [{ id: "shift-1", shift_date: "2026-07-23", operator_id: "op-1", status: "CLOSED" }] });
  const detail = await getOperationStayById(db, CO1_PARKINGS, "s2");
  assert.equal(detail.entry.shiftDate, "2026-07-23");
  assert.equal(detail.exit.shiftDate, "2026-07-23");
});

test("DETALLE: id inexistente devuelve null (no lanza, no inventa un registro)", async () => {
  const db = createMockDb({ stays: STAYS });
  const detail = await getOperationStayById(db, CO1_PARKINGS, "no-existe");
  assert.equal(detail, null);
});

test("las rutas /api/operacion reutilizan authorizeOperationRequest + REPORTS_READ/OPERATIONS_USE y resuelven el scope antes de consultar", async () => {
  const [listRoute, detailRoute] = await Promise.all([
    readFile(new URL("../app/api/operacion/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operacion/[id]/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(listRoute, /authorizeOperationRequest\(request, \[PERMISSIONS\.REPORTS_READ, PERMISSIONS\.OPERATIONS_USE\]\)/);
  assert.match(listRoute, /listParkings\(authorization\.db, authorization\.scope\)/);
  assert.match(listRoute, /searchOperationStays\(authorization\.db, scopedParkings,/);
  assert.match(listRoute, /operationAuthorizationError\(/);
  assert.doesNotMatch(listRoute, /getSupabaseAdminClient|service_role/i);

  assert.match(detailRoute, /authorizeOperationRequest\(request, \[PERMISSIONS\.REPORTS_READ, PERMISSIONS\.OPERATIONS_USE\]\)/);
  assert.match(detailRoute, /getOperationStayById\(authorization\.db, scopedParkings, id\)/);
  assert.match(detailRoute, /operationAuthorizationError\(/);
});

test("authorizeOperationRequest con un string único se comporta exactamente igual que antes (retrocompatible)", async () => {
  const source = await readFile(new URL("./auth/operationAuthorization.js", import.meta.url), "utf8");
  assert.match(source, /if \(Array\.isArray\(permission\)\)/);
  assert.match(source, /requirePermission\(authorization\.context, permission\)/); // rama string histórica intacta
});
