import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { listOpenPosStays, quoteOpenPosStay, searchActivityReport } from "./posStaysService.js";

function createMockDb({ parking, stays }) {
  const calls = [];

  function queryFor(table) {
    const filters = [];

    const api = {
      select() {
        calls.push({ table, op: "select" });
        return api;
      },
      eq(field, value) {
        filters.push([field, value]);
        return api;
      },
      order(field, options) {
        calls.push({ table, op: "order", field, options, filters: [...filters] });
        if (table === "parking_stays") {
          const parkingId = filters.find(([field]) => field === "parking_id")?.[1];
          const status = filters.find(([field]) => field === "status")?.[1];
          const result = (stays || []).filter((stay) => (!parkingId || stay.parking_id === parkingId) && (!status || stay.status === status));
          return Promise.resolve({ data: result, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle() {
        calls.push({ table, op: "maybeSingle", filters: [...filters] });
        if (table === "parkings") {
          const parkingId = filters.find(([field]) => field === "id")?.[1];
          const status = filters.find(([field]) => field === "status")?.[1];
          const ok = parking && (!parkingId || parking.id === parkingId) && (!status || parking.status === status);
          return Promise.resolve({ data: ok ? parking : null, error: null });
        }

        if (table === "parking_stays") {
          const parkingId = filters.find(([field]) => field === "parking_id")?.[1];
          const stayId = filters.find(([field]) => field === "id")?.[1];
          const status = filters.find(([field]) => field === "status")?.[1];
          const stay = (stays || []).find((item) => (!parkingId || item.parking_id === parkingId) && (!stayId || item.id === stayId) && (!status || item.status === status)) || null;
          return Promise.resolve({ data: stay, error: null });
        }

        return Promise.resolve({ data: null, error: null });
      },
    };

    return api;
  }

  return {
    calls,
    from(table) {
      return queryFor(table);
    },
  };
}

test("lista solo estadías OPEN del parking asignado y usa hora servidor para cotizar", async () => {
  const fixedNow = new Date("2026-08-17T16:30:00.000Z");
  const db = createMockDb({
    parking: { id: "parking-1", name: "Parking Centro", status: "ACTIVE" },
    stays: [
      { id: "stay-1", parking_id: "parking-1", status: "OPEN", code: "ING-001", license_plate: "CXPY-93", entry_at: "2026-08-17T15:00:00.000Z" },
      { id: "stay-2", parking_id: "parking-2", status: "OPEN", code: "ING-999", license_plate: "ZZZZ-99", entry_at: "2026-08-17T15:05:00.000Z" },
      { id: "stay-3", parking_id: "parking-1", status: "PAID", code: "ING-777", license_plate: "ABCD-12", entry_at: "2026-08-17T14:00:00.000Z" },
    ],
  });

  const seen = [];
  const result = await listOpenPosStays(db, "parking-1", {
    now: fixedNow,
    quoteFn: async (_db, stay, options) => {
      seen.push({ stayId: stay.id, now: options.now });
      return {
        blocked: false,
        total: stay.id === "stay-1" ? 1800 : 2400,
        elapsedMinutes: stay.id === "stay-1" ? 90 : 120,
        rate: { name: "Tarifa real", billingMode: "EFFECTIVE_MINUTE" },
      };
    },
  });

  assert.equal(result.serverNow, fixedNow.toISOString());
  assert.equal(result.parking.id, "parking-1");
  assert.equal(result.stays.length, 1);
  assert.equal(result.stays[0].id, "stay-1");
  assert.equal(result.stays[0].quote.total, 1800);
  assert.equal(result.stays[0].quote.elapsedMinutes, 90);
  assert.deepEqual(seen, [{ stayId: "stay-1", now: fixedNow }]);
});

test("el detalle cotiza nuevamente sin mutar la permanencia", async () => {
  const fixedNow = new Date("2026-08-17T16:45:00.000Z");
  const db = createMockDb({
    parking: { id: "parking-1", name: "Parking Centro", status: "ACTIVE" },
    stays: [
      { id: "stay-1", parking_id: "parking-1", status: "OPEN", code: "ING-001", license_plate: "CXPY-93", entry_at: "2026-08-17T15:00:00.000Z" },
    ],
  });

  const result = await quoteOpenPosStay(db, "parking-1", "stay-1", {
    now: fixedNow,
    quoteFn: async (_db, stay, options) => ({
      blocked: false,
      total: 2200,
      elapsedMinutes: 105,
      rate: { name: "Tarifa real", billingMode: "EFFECTIVE_MINUTE" },
      calculatedAt: options.now.toISOString(),
      stayId: stay.id,
    }),
  });

  assert.equal(result.serverNow, fixedNow.toISOString());
  assert.equal(result.stay.id, "stay-1");
  assert.equal(result.quote.total, 2200);
  assert.equal(result.quote.calculatedAt, fixedNow.toISOString());
  assert.equal(db.calls.some((call) => call.op === "insert" || call.op === "update"), false);
});

test("la API y la UI POS quedan separadas de Webpay y no calculan minutos en el navegador", async () => {
  const [routeList, routeQuote, terminal] = await Promise.all([
    readFile(new URL("../app/api/pos/stays/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pos/stays/[stayId]/quote/route.js", import.meta.url), "utf8"),
    readFile(new URL("../components/pos/PosTerminal.js", import.meta.url), "utf8"),
  ]);

  assert.match(routeList, /authorizeOperationRequest\(/);
  assert.match(routeList, /listOpenPosStays\(/);
  assert.match(routeQuote, /quoteOpenPosStay\(/);
  assert.match(routeQuote, /requireOperationalParking\(/);
  assert.match(terminal, /VEHICULO_DETALLE/);
  assert.match(terminal, /setCurrentView\(POS_VIEWS\.VEHICULO_DETALLE\)/);
  assert.match(terminal, /role="button"/);
  assert.match(terminal, /cursor-pointer/);
  assert.match(terminal, /PAGAR/);
  assert.match(terminal, /EFECTIVO/);
  assert.match(terminal, /DÉBITO/);
  assert.match(terminal, /CRÉDITO/);
  assert.match(terminal, /Pago con tarjeta pendiente de integración TUU/);
  assert.match(terminal, /action: "EXIT"/);
  assert.match(terminal, /paymentMethod: "CASH"/);
  assert.doesNotMatch(terminal, /Date\.now\(\)/);
  assert.doesNotMatch(terminal, /getMinutesInside/);
  assert.doesNotMatch(routeList, /insert\(|update\(/);
  assert.doesNotMatch(routeQuote, /insert\(|update\(/);
});

// --- searchActivityReport (modal de detalle de /modelo-dashboard) ---
//
// searchActivityReport recibe la lista de estacionamientos accesibles YA
// resuelta (scopedParkings) — no importa estacionamientosRepository.js
// (tiene "server-only", ver comentario en posStaysService.js), así que el
// aislamiento por empresa se simula aquí pasando directamente solo los
// parkings de la empresa "co-1" (como si la ruta ya hubiera resuelto
// listParkings(db, authorization.scope) y excluido "p-otra-empresa").
//
// Mock genérico de query builder de Supabase: parking_stays es una lista de
// filas en memoria, los filtros (.eq/.in/.gte/.lte) se acumulan y se
// resuelven al hacer `await` sobre el builder (igual que el cliente real,
// que es "thenable" sin exigir un método terminal como .order()).
function createReportMockDb({ stays = [] } = {}) {
  function builder(rows) {
    const predicates = [];
    let orderBy = null;
    const api = {
      select() { return api; },
      eq(field, value) { predicates.push((row) => row[field] === value); return api; },
      in(field, values) { const set = new Set(values); predicates.push((row) => set.has(row[field])); return api; },
      gte(field, value) { predicates.push((row) => row[field] >= value); return api; },
      lte(field, value) { predicates.push((row) => row[field] <= value); return api; },
      order(field, options) { orderBy = { field, ascending: options?.ascending !== false }; return api; },
      then(resolve) {
        let data = rows.filter((row) => predicates.every((fn) => fn(row)));
        if (orderBy) {
          data = [...data].sort((a, b) => {
            const cmp = a[orderBy.field] < b[orderBy.field] ? -1 : a[orderBy.field] > b[orderBy.field] ? 1 : 0;
            return orderBy.ascending ? cmp : -cmp;
          });
        }
        resolve({ data, error: null });
      },
    };
    return api;
  }
  return {
    from(table) {
      if (table === "parking_stays") return builder(stays);
      return builder([]);
    },
  };
}

// Parkings de "co-1" ya resueltos por el llamador (equivalente a lo que
// devolvería listParkings tras aplicar authorization.scope) — "p-otra-
// empresa" (co-2) queda deliberadamente fuera de esta lista, nunca se pasa.
const CO1_PARKINGS = [
  { id: "p-centro", code: "CTR", name: "Parking Centro" },
  { id: "p-norte", code: "NTE", name: "Parking Norte" },
];

const REPORT_STAYS = [
  { id: "s1", code: "ING-001", license_plate: "AAAA-11", parking_id: "p-centro", status: "OPEN", entry_at: "2026-07-28T15:00:00.000Z", exit_at: null, payment_method: null, total_amount: null },
  { id: "s2", code: "ING-002", license_plate: "BBBB-22", parking_id: "p-centro", status: "PAID", entry_at: "2026-07-27T20:00:00.000Z", exit_at: "2026-07-27T22:00:00.000Z", payment_method: "CASH", total_amount: 1590 },
  { id: "s3", code: "ING-003", license_plate: "CCCC-33", parking_id: "p-norte", status: "PAID", entry_at: "2026-07-27T21:00:00.000Z", exit_at: "2026-07-27T23:00:00.000Z", payment_method: "CARD", total_amount: 2550 },
  { id: "s4", code: "ING-004", license_plate: "DDDD-44", parking_id: "p-centro", status: "CANCELLED", entry_at: "2026-07-26T15:00:00.000Z", exit_at: null, payment_method: null, total_amount: null },
  // "de otra empresa": presente en la tabla (como lo estaría en una BD real
  // compartida) pero su parking_id ("p-otra-empresa") nunca aparece en
  // CO1_PARKINGS, así que ninguna consulta con ese scope debe devolverlo.
  { id: "s5", code: "ING-005", license_plate: "EEEE-55", parking_id: "p-otra-empresa", status: "PAID", entry_at: "2026-07-27T15:00:00.000Z", exit_at: "2026-07-27T16:00:00.000Z", payment_method: "CASH", total_amount: 999 },
];

test("REPORTE: 'pendientes' devuelve solo status OPEN, y jamás datos de otra empresa (aislamiento por parkings ya resueltos)", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const result = await searchActivityReport(db, CO1_PARKINGS, { activity: "pendientes" });
  assert.deepEqual(result.rows.map((r) => r.id), ["s1"]);
  assert.ok(result.parkings.every((p) => p.id !== "p-otra-empresa")); // nunca se ofrece un parking de otra empresa como opción
});

test("REPORTE: 'salidas' devuelve solo status PAID y jamás CANCELLED/OPEN", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const result = await searchActivityReport(db, CO1_PARKINGS, { activity: "salidas" });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["s2", "s3"]);
});

test("REPORTE: 'anulados' devuelve solo status CANCELLED", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const result = await searchActivityReport(db, CO1_PARKINGS, { activity: "anulados" });
  assert.deepEqual(result.rows.map((r) => r.id), ["s4"]);
});

test("REPORTE: medio de pago CASH/CARD filtra exclusivamente ese medio", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const cash = await searchActivityReport(db, CO1_PARKINGS, { paymentMethod: "CASH" });
  assert.deepEqual(cash.rows.map((r) => r.id).sort(), ["s2"]); // s5 es de otra empresa, no debe aparecer
  const card = await searchActivityReport(db, CO1_PARKINGS, { paymentMethod: "CARD" });
  assert.deepEqual(card.rows.map((r) => r.id), ["s3"]);
});

test("REPORTE: parkingId puntual acota a ese estacionamiento (estacionamiento A no devuelve filas de B)", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const centro = await searchActivityReport(db, CO1_PARKINGS, { parkingId: "p-centro" });
  assert.ok(centro.rows.every((r) => r.parkingId === "p-centro"));
  assert.deepEqual(centro.rows.map((r) => r.id).sort(), ["s1", "s2", "s4"]);
});

test("REPORTE: parkingId fuera de los parkings resueltos se rechaza (nunca se filtra por un parking ajeno)", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  await assert.rejects(
    () => searchActivityReport(db, CO1_PARKINGS, { parkingId: "p-otra-empresa" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("REPORTE: rango de fechas exacto e inclusivo sobre el campo real de la actividad", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  // 27/07/2026 en Santiago: s2 (entry 20:00 UTC), s3 (entry 21:00 UTC). s1 es 28/07, s4 es 26/07 -> fuera.
  const result = await searchActivityReport(db, CO1_PARKINGS, { dateFrom: "2026-07-27", dateTo: "2026-07-27" });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["s2", "s3"]);
});

test("REPORTE: sin resultados -> 0 filas, sin inventar ni devolver el universo completo", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const result = await searchActivityReport(db, CO1_PARKINGS, { dateFrom: "2020-01-01", dateTo: "2020-01-02" });
  assert.deepEqual(result.rows, []);
  assert.equal(result.total, 0);
});

test("REPORTE: paginación básica — total refleja el universo filtrado, rows solo la página pedida", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const page1 = await searchActivityReport(db, CO1_PARKINGS, { pageSize: 2, page: 1 });
  const page2 = await searchActivityReport(db, CO1_PARKINGS, { pageSize: 2, page: 2 });
  assert.equal(page1.rows.length, 2);
  assert.equal(page1.total, 4); // s1,s2,s4 (p-centro) + s3 (p-norte) = 4 filas de co-1
  assert.equal(page2.total, 4);
  const seenIds = new Set([...page1.rows.map((r) => r.id), ...page2.rows.map((r) => r.id)]);
  assert.equal(seenIds.size, 4); // páginas no se solapan ni repiten filas
});

test("REPORTE: sin parkings resueltos (p. ej. operador sin asignaciones) -> vacío, nunca cae al universo completo", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const result = await searchActivityReport(db, [], {});
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.parkings, []);
});

test("REPORTE: el monto total de las filas devueltas es la suma exacta (no un total ajeno)", async () => {
  const db = createReportMockDb({ stays: REPORT_STAYS });
  const result = await searchActivityReport(db, CO1_PARKINGS, { activity: "salidas" });
  const total = result.rows.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(total, 1590 + 2550);
});

test("REPORTE: el endpoint reutiliza el patrón de autorización existente (authorizeOperationRequest + REPORTS_READ) y resuelve el scope antes de consultar", async () => {
  const routeSource = await readFile(new URL("../app/api/reportes/actividad/route.js", import.meta.url), "utf8");
  assert.match(routeSource, /authorizeOperationRequest\(request, PERMISSIONS\.REPORTS_READ\)/);
  assert.match(routeSource, /listParkings\(authorization\.db, authorization\.scope\)/);
  assert.match(routeSource, /searchActivityReport\(authorization\.db, scopedParkings,/);
  assert.match(routeSource, /operationAuthorizationError\(/);
  assert.doesNotMatch(routeSource, /getSupabaseAdminClient|service_role/i);
});

test("REPORTE: searchActivityReport no importa estacionamientosRepository (evita depender de \"server-only\")", async () => {
  const serviceSource = await readFile(new URL("./posStaysService.js", import.meta.url), "utf8");
  assert.doesNotMatch(serviceSource, /from ["']\.\/estacionamientosRepository/);
});
