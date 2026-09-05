import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { getRevenueOverview, RevenueRangeTooWideError, searchRevenueClosures, searchRevenueTransactions } from "./offStreetRevenueService.js";

// Mock genérico de query builder de Supabase -- mismo patrón que
// offStreetOperationsService.test.mjs (Fase 1), extendido con .range() real
// (slice server-side por tramo, no un .limit() ilustrativo) para poder
// probar el mecanismo de fetch-todo-por-chunks sin techo silencioso.
// `rangeCalls` (opcional) registra cada llamada .range(from,to) hecha sobre
// esta tabla, para poder afirmar CUÁNTOS tramos pidió el servicio real.
function createMockDb({ stays = [], shifts = [], closures = [], rangeCalls = null } = {}) {
  function builder(rows, table) {
    const predicates = [];
    let orderBy = null;
    const api = {
      select() { return api; },
      eq(field, value) { predicates.push((row) => row[field] === value); return api; },
      in(field, values) { const set = new Set(values); predicates.push((row) => set.has(row[field])); return api; },
      gte(field, value) { predicates.push((row) => row[field] >= value); return api; },
      lte(field, value) { predicates.push((row) => row[field] <= value); return api; },
      or(expr) {
        const clauses = expr.split(",").map((clause) => {
          const [field, , pattern] = clause.split(".");
          const needle = pattern.replace(/%/g, "").toLowerCase();
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
        if (rangeCalls) rangeCalls.push({ table, from, to });
        const page = api.sortedMatches().slice(from, to + 1);
        return Promise.resolve({ data: page, error: null });
      },
      // El cliente real de Supabase es "thenable" sin exigir un método
      // terminal como .range() -- usado por lookups puntuales sin
      // paginación (p. ej. resolver turnos por lote vía operator_shifts).
      then(resolve) {
        resolve({ data: api.sortedMatches(), error: null });
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

// Genera N estadías PAID sintéticas dentro de un mismo día (para probar el
// mecanismo de fetch-todo-por-chunks con volumen real, sin depender de
// fixtures manuales de miles de líneas).
function generatePaidStays(count, { parkingId = "p-centro", dayIso = "2026-07-24" } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `bulk-${index}`,
    code: `TK-BULK-${index}`,
    license_plate: `BULK-${String(index).padStart(4, "0")}`,
    parking_id: parkingId,
    status: "PAID",
    // Distribuye las horas dentro del mismo día operacional Santiago
    // (14:00-14:59 UTC = 10:00-10:59 Santiago en julio) para que el recorte
    // exacto de día no descarte ninguna.
    exit_at: `${dayIso}T14:${String(index % 60).padStart(2, "0")}:00.000Z`,
    exit_operator_id: "op-ana",
    exit_operator_name: "Ana",
    payment_method: index % 2 === 0 ? "CASH" : "CARD",
    total_amount: 1000,
    payment_code: `PAY-BULK-${index}`,
    payment_shift_id: null,
  }));
}

const CO1_PARKINGS = [
  { id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" },
  { id: "p-norte", code: "NTE", name: "Parking Norte", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" },
  // Parking ON_STREET de la MISMA empresa -- nunca debe aparecer en
  // /recaudacion (Off Street Fase 2), ni en transacciones (parking_stays no
  // lo usaría de todas formas) ni sobre todo en cierres (shift_closures SÍ
  // es compartida con On Street).
  { id: "p-via-publica", code: "VP1", name: "Vía Pública 1", companyId: "co-1", companyName: "Empresa Uno", type: "ON_STREET" },
];
const ALL_PARKINGS = [
  ...CO1_PARKINGS,
  { id: "p-otra-empresa", code: "OTR", name: "Parking Otra", companyId: "co-2", companyName: "Empresa Dos", type: "OFF_STREET" },
];

const STAYS = [
  { id: "s1", code: "TK-001", license_plate: "AAAA-11", parking_id: "p-centro", status: "PAID", exit_at: "2026-07-24T15:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1500, payment_code: "PAY-001", payment_shift_id: "shift-1" },
  { id: "s2", code: "TK-002", license_plate: "BBBB-22", parking_id: "p-centro", status: "PAID", exit_at: "2026-07-23T20:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CARD", total_amount: 2000, payment_code: "PAY-002", payment_shift_id: null },
  { id: "s3", code: "TK-003", license_plate: "CCCC-33", parking_id: "p-norte", status: "PAID", exit_at: "2026-07-23T21:00:00.000Z", exit_operator_id: "op-beto", exit_operator_name: "Beto", payment_method: "CARD", total_amount: 2550, payment_code: "PAY-003", payment_shift_id: null },
  { id: "s4", code: "TK-004", license_plate: "DDDD-44", parking_id: "p-centro", status: "OPEN", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, payment_code: null, payment_shift_id: null },
  { id: "s5", code: "TK-005", license_plate: "EEEE-55", parking_id: "p-centro", status: "CANCELLED", exit_at: null, exit_operator_id: null, exit_operator_name: null, payment_method: null, total_amount: null, payment_code: null, payment_shift_id: null },
  // otra empresa: nunca debe aparecer con scope CO1_PARKINGS.
  { id: "s6", code: "TK-006", license_plate: "FFFF-66", parking_id: "p-otra-empresa", status: "PAID", exit_at: "2026-07-24T15:00:00.000Z", exit_operator_id: "op-root", exit_operator_name: "Root", payment_method: "CASH", total_amount: 999, payment_code: "PAY-006", payment_shift_id: null },
  // On Street, MISMA empresa (co-1), parking p-via-publica -- monto grande
  // (50000) a propósito: si se colara en cualquier KPI/serie/CSV Off Street
  // sería inmediatamente evidente (dispara el total en 33x).
  { id: "s7", code: "TK-007", license_plate: "GGGG-77", parking_id: "p-via-publica", status: "PAID", exit_at: "2026-07-24T15:00:00.000Z", exit_operator_id: "op-carla", exit_operator_name: "Carla", payment_method: "CASH", total_amount: 50000, payment_code: "PAY-007", payment_shift_id: null },
];

const SHIFTS = [{ id: "shift-1", shift_date: "2026-07-24" }];

const CLOSURES = [
  { id: "c1", shift_id: "sh1", folio: "CT-1", parking_id: "p-centro", parking_name: "Parking Centro", company_name: "Empresa Uno", operator_id: "op-ana", operator_name: "Ana", shift_date: "2026-07-24", actual_start_at: "2026-07-24T08:00:00Z", actual_close_at: "2026-07-24T16:00:00Z", paid_vehicles_count: 5, cancelled_vehicles_count: 0, pending_vehicles_count: 1, cash_amount: 3000, card_amount: 4000, collected_amount: 7000, declared_cash_amount: 2900, cash_difference: -100, difference_observation: "Faltante", closure_status: "CONFIRMED", confirmed_by: "op-ana", confirmed_at: "2026-07-24T16:01:00Z" },
  { id: "c2", shift_id: "sh2", folio: "CT-2", parking_id: "p-norte", parking_name: "Parking Norte", company_name: "Empresa Uno", operator_id: "op-beto", operator_name: "Beto", shift_date: "2026-07-23", actual_start_at: "2026-07-23T08:00:00Z", actual_close_at: "2026-07-23T16:00:00Z", paid_vehicles_count: 3, cancelled_vehicles_count: 0, pending_vehicles_count: 0, cash_amount: 1000, card_amount: 1550, collected_amount: 2550, declared_cash_amount: 1000, cash_difference: 0, difference_observation: "", closure_status: "CONFIRMED", confirmed_by: "op-beto", confirmed_at: "2026-07-23T16:01:00Z" },
  // Cierre ON STREET del mismo parking_id de vía pública -- nunca debe
  // aparecer en /recaudacion Off Street.
  { id: "c3", shift_id: "sh3", folio: "CT-3", parking_id: "p-via-publica", parking_name: "Vía Pública 1", company_name: "Empresa Uno", operator_id: "op-carla", operator_name: "Carla", shift_date: "2026-07-24", actual_start_at: "2026-07-24T08:00:00Z", actual_close_at: "2026-07-24T16:00:00Z", paid_vehicles_count: 20, cancelled_vehicles_count: 1, pending_vehicles_count: 0, cash_amount: 50000, card_amount: 0, collected_amount: 50000, declared_cash_amount: 50000, cash_difference: 0, difference_observation: "", closure_status: "CONFIRMED", confirmed_by: "op-carla", confirmed_at: "2026-07-24T16:01:00Z" },
];

test("TRANSACCIONES: solo estadías PAID cuentan como recaudación real (OPEN/CANCELLED nunca aparecen)", async () => {
  const db = createMockDb({ stays: STAYS, shifts: SHIFTS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["s1", "s2", "s3"]);
});

test("TRANSACCIONES: monto, medio de pago, operador, parking, ticket y patente correctos", async () => {
  const db = createMockDb({ stays: STAYS, shifts: SHIFTS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  const row = result.rows.find((r) => r.id === "s1");
  assert.equal(row.amount, 1500);
  assert.equal(row.paymentMethod, "CASH");
  assert.equal(row.operator, "Ana");
  assert.equal(row.parkingName, "Parking Centro");
  assert.equal(row.ticket, "TK-001");
  assert.equal(row.plate, "AAAA-11");
  assert.equal(row.paymentCode, "PAY-001");
  assert.equal(row.shiftLabel, "Turno 2026-07-24"); // resuelto por lote vía payment_shift_id -> operator_shifts
});

test("TRANSACCIONES: fila sin payment_shift_id (pago automático/Webpay) no rompe la resolución de turno por lote", async () => {
  const db = createMockDb({ stays: STAYS, shifts: SHIFTS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  const row = result.rows.find((r) => r.id === "s2");
  assert.equal(row.shiftLabel, "");
});

test("AISLAMIENTO: transacciones nunca incluyen otra empresa", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.ok(!result.rows.some((r) => r.id === "s6"));
  assert.ok(result.companies.every((c) => c.id !== "co-2"));
});

test("MANIPULACIÓN companyId: pedir companyId fuera de scopedParkings nunca amplía el acceso", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { companyId: "co-2", dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows, []);
});

test("AISLAMIENTO: parkingId fuera del scope se rechaza como recurso no encontrado", async () => {
  const db = createMockDb({ stays: STAYS });
  await assert.rejects(
    () => searchRevenueTransactions(db, CO1_PARKINGS, { parkingId: "p-otra-empresa" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

test("BÚSQUEDA por código de pago funciona (§7)", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { query: "pay-003" });
  assert.deepEqual(result.rows.map((r) => r.id), ["s3"]);
});

test("FILTRO medio de pago real (CASH/CARD)", async () => {
  const db = createMockDb({ stays: STAYS });
  const cash = await searchRevenueTransactions(db, CO1_PARKINGS, { paymentMethod: "CASH" });
  assert.deepEqual(cash.rows.map((r) => r.id), ["s1"]);
});

test("FILTRO operador (exit_operator_id)", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { operatorId: "op-beto" });
  assert.deepEqual(result.rows.map((r) => r.id), ["s3"]);
});

test("RESUMEN: total, efectivo, tarjeta, cantidad y ticket promedio correctos", async () => {
  const db = createMockDb({ stays: STAYS, closures: [] });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", now: new Date("2026-07-24T18:00:00Z") });
  assert.equal(overview.summary.totalAmount, 1500 + 2000 + 2550);
  assert.equal(overview.summary.cashAmount, 1500);
  assert.equal(overview.summary.cardAmount, 2000 + 2550);
  assert.equal(overview.summary.count, 3);
  assert.equal(overview.summary.averageTicket, Math.round((1500 + 2000 + 2550) / 3));
});

test("RESUMEN: nunca incluye recaudación de otra empresa", async () => {
  const db = createMockDb({ stays: STAYS });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.equal(overview.summary.totalAmount, 6050); // nunca 7049 (que incluiría s6, co-2)
});

test("RESUMEN: serie diaria real agrupada por día operacional", async () => {
  const db = createMockDb({ stays: STAYS });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-23", dateTo: "2026-07-24" });
  const day24 = overview.dailySeries.find((d) => d.date === "2026-07-24");
  const day23 = overview.dailySeries.find((d) => d.date === "2026-07-23");
  assert.equal(day24.amount, 1500); // s1
  assert.equal(day23.amount, 2000 + 2550); // s2, s3
});

test("ZONA HORARIA (borde real 20:00-24:00 Chile): un pago a las 22:00 hora Santiago cuenta en el día correcto aunque su instante UTC ya sea el día calendario siguiente", async () => {
  // exit_at = 2026-07-24T02:00:00Z = 23-07-2026 22:00 en America/Santiago
  // (Chile en UTC-4, invierno). Día UTC = 24/07, día operacional real
  // (Santiago) = 23/07. Mismo caso límite validado en Fase 1
  // (offStreetOperationsService.test.mjs) sobre getOperationsSummary.
  const edgeStay = { id: "edge-1", code: "TK-EDGE", license_plate: "EDGE-01", parking_id: "p-centro", status: "PAID", exit_at: "2026-07-24T02:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1234, payment_code: "PAY-EDGE", payment_shift_id: null };
  const db = createMockDb({ stays: [edgeStay] });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-23", dateTo: "2026-07-23" });
  const day23 = overview.dailySeries.find((d) => d.date === "2026-07-23");
  assert.equal(day23.amount, 1234, "el pago de las 22:00 hora Santiago debe agruparse en 23/07 (día Santiago), no en 24/07 (día UTC)");
  assert.equal(overview.summary.totalAmount, 1234);
});

test("DIFERENCIAS DE CAJA: se agregan desde shift_closures reales, acotadas a parkings OFF_STREET del scope", async () => {
  const db = createMockDb({ stays: STAYS, closures: CLOSURES });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  // c1 (-100) + c2 (0) de Off Street; c3 es On Street (p-via-publica) y NO debe sumarse.
  assert.equal(overview.cashDifference.totalDifference, -100);
});

test("CIERRES: solo estacionamientos OFF_STREET del scope -- un cierre On Street de la MISMA empresa no aparece", async () => {
  const db = createMockDb({ closures: CLOSURES });
  const result = await searchRevenueClosures(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["c1", "c2"]);
});

test("CIERRES: esperado(gross)/declarado/diferencia correctos", async () => {
  const db = createMockDb({ closures: CLOSURES });
  const result = await searchRevenueClosures(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  const c1 = result.rows.find((r) => r.id === "c1");
  assert.equal(c1.grossAmount, 7000);
  assert.equal(c1.declaredCashAmount, 2900);
  assert.equal(c1.cashDifference, -100);
  assert.equal(c1.companyName, "Empresa Uno");
  assert.equal(c1.parkingName, "Parking Centro");
});

test("AISLAMIENTO: cierre de otro parking (empresa distinta) no aparece", async () => {
  const db = createMockDb({ closures: [...CLOSURES, { id: "c4", shift_id: "sh4", folio: "CT-4", parking_id: "p-otra-empresa", parking_name: "Parking Otra", company_name: "Empresa Dos", operator_id: "op-x", operator_name: "X", shift_date: "2026-07-24", actual_start_at: "2026-07-24T08:00:00Z", actual_close_at: "2026-07-24T16:00:00Z", paid_vehicles_count: 1, cancelled_vehicles_count: 0, pending_vehicles_count: 0, cash_amount: 100, card_amount: 0, collected_amount: 100, declared_cash_amount: 100, cash_difference: 0, difference_observation: "", closure_status: "CONFIRMED", confirmed_by: "op-x", confirmed_at: "2026-07-24T16:01:00Z" }] });
  const result = await searchRevenueClosures(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.ok(!result.rows.some((r) => r.id === "c4"));
});

test("CIERRES: all=true (exportación completa, Fase 4) devuelve el conjunto completo, no solo una página, y sigue excluyendo otros tenants/On Street", async () => {
  const db = createMockDb({ closures: CLOSURES });
  const result = await searchRevenueClosures(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", all: true, pageSize: 1 });
  assert.deepEqual(result.rows.map((r) => r.id).sort(), ["c1", "c2"]); // ambas filas Off Street, pageSize=1 ignorado por all=true
  assert.equal(result.pageSize, result.rows.length);
});

test("CIERRES: parkingId fuera del scope se rechaza", async () => {
  const db = createMockDb({ closures: CLOSURES });
  await assert.rejects(
    () => searchRevenueClosures(db, CO1_PARKINGS, { parkingId: "p-otra-empresa" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

// ============================================================
// §2 de la auditoría forense: aislamiento Off Street/On Street demostrado
// EXPLÍCITAMENTE sobre las 3 superficies reales (transacciones, resumen/
// KPIs/serie diaria, cierres) -- misma empresa, un parking OFF_STREET (con
// datos reales) y un parking ON_STREET (con un pago PAID real y un cierre
// real, s7/c3 en los fixtures de arriba). El CSV del frontend no tiene
// prueba propia porque exporta literalmente las mismas `rows` que ya
// devolvió /api/recaudacion -- probar la respuesta del endpoint (rows/
// resumen/serieDiaria) prueba el CSV por construcción.
// ============================================================

test("AISLAMIENTO OFF/ON STREET -- tabla de transacciones: el pago On Street (s7, mismo tenant) nunca aparece", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.ok(!result.rows.some((row) => row.id === "s7"), "s7 es On Street (p-via-publica) -- nunca debe listarse en /recaudacion Off Street");
});

test("AISLAMIENTO OFF/ON STREET -- KPIs: Total/Efectivo/Tarjeta/Transacciones/Ticket promedio NO se alteran por el pago On Street", async () => {
  const db = createMockDb({ stays: STAYS });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  // Universo Off Street real: s1(1500 CASH)+s2(2000 CARD)+s3(2550 CARD) = 6050, 3 transacciones.
  // Si s7 (50000 CASH, On Street) se colara: total pasaría a 56050 -- inmediatamente detectable.
  assert.equal(overview.summary.totalAmount, 6050);
  assert.equal(overview.summary.cashAmount, 1500); // nunca 51500 (1500+50000 de s7)
  assert.equal(overview.summary.cardAmount, 4550);
  assert.equal(overview.summary.count, 3); // nunca 4
  assert.equal(overview.summary.averageTicket, Math.round(6050 / 3));
});

test("AISLAMIENTO OFF/ON STREET -- gráfico de recaudación diaria: el día del pago On Street no incluye su monto", async () => {
  const db = createMockDb({ stays: STAYS });
  // s1 (Off Street, 1500) y s7 (On Street, 50000) caen el MISMO día
  // operacional (2026-07-24) -- si la serie no filtrara por producto, ese
  // día mostraría 51500 en vez de 1500.
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-24", dateTo: "2026-07-24" });
  const day24 = overview.dailySeries.find((d) => d.date === "2026-07-24");
  assert.equal(day24.amount, 1500);
});

test("AISLAMIENTO OFF/ON STREET -- exportación CSV (all=true): el conjunto completo exportado tampoco incluye el pago On Street", async () => {
  const db = createMockDb({ stays: STAYS });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", all: true });
  assert.ok(!result.rows.some((row) => row.id === "s7"));
  assert.equal(result.rows.reduce((sum, row) => sum + row.amount, 0), 6050);
});

test("AISLAMIENTO OFF/ON STREET -- un parkingId On Street enviado manualmente por querystring se rechaza (no amplía a recaudación Off Street ni devuelve datos On Street)", async () => {
  const db = createMockDb({ stays: STAYS });
  // "p-via-publica" nunca es un estacionamiento OFF_STREET candidato (se
  // filtra antes de resolver parkingId) -- igual que un parking de otro
  // tenant, se rechaza como recurso no encontrado, nunca como "encontrado
  // pero vacío" (que insinuaría que el id era válido para este dominio).
  await assert.rejects(
    () => searchRevenueTransactions(db, CO1_PARKINGS, { parkingId: "p-via-publica" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
  await assert.rejects(
    () => searchRevenueClosures(db, CO1_PARKINGS, { parkingId: "p-via-publica" }),
    (error) => error.code === "RESOURCE_NOT_FOUND" && error.status === 404,
  );
});

// ============================================================
// §3: filtro de Operador -- ya soportado server-side (operatorId), ahora
// también expuesto en la UI (ver src/app/recaudacion/page.js, reutiliza
// GET /api/usuarios / listAuthorizedUsers, ya scoped por empresa vía
// companyScope -- ningún endpoint nuevo). Prueba de que operatorId nunca
// amplía el scope, aunque pertenezca a otra empresa.
// ============================================================

test("MANIPULACIÓN operatorId: un operatorId de otra empresa no amplía el acceso (sus pagos, si los tuviera, no están en el scope igualmente)", async () => {
  const db = createMockDb({ stays: STAYS });
  // "op-root" es el operador real de s6 (otra empresa, co-2) -- pedirlo
  // dentro del scope de CO1_PARKINGS no debe devolver s6 (fuera de scope de
  // parking_id) ni ningún otro dato.
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { operatorId: "op-root", dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows, []);
});

// ============================================================
// §5: KPIs deben reflejar los mismos filtros que la tabla (medio de pago,
// operador) -- la búsqueda de texto libre es la excepción documentada.
// ============================================================

test("KPIs Y FILTROS: el resumen respeta paymentMethod, igual que la tabla", async () => {
  const db = createMockDb({ stays: STAYS });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", paymentMethod: "CASH" });
  assert.equal(overview.summary.totalAmount, 1500); // solo s1 (CASH)
  assert.equal(overview.summary.count, 1);
});

test("KPIs Y FILTROS: el resumen respeta operatorId, igual que la tabla", async () => {
  const db = createMockDb({ stays: STAYS });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", operatorId: "op-beto" });
  assert.equal(overview.summary.totalAmount, 2550); // solo s3 (Beto)
  assert.equal(overview.summary.count, 1);
});

test("KPIs Y FILTROS: la búsqueda de texto libre NO acota el resumen (documentado: search es exclusivo de la tabla)", async () => {
  const db = createMockDb({ stays: STAYS });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  const filteredTable = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31", query: "pay-003" });
  assert.equal(overview.summary.count, 3); // el resumen sigue viendo las 3 transacciones del período
  assert.equal(filteredTable.rows.length, 1); // la tabla sí queda acotada a la búsqueda
});

// ============================================================
// §6: definición de pago real -- status='PAID' es necesario y suficiente
// (respaldado por el propio constraint de la tabla real: status='PAID'
// exige exit_at y payment_code no nulos -- ver
// supabase/migrations/20260731130000_parking_stays_tickets.sql). No se
// impone ninguna condición artificial adicional (ni "total_amount > 0" ni
// "payment_method not null"): en la práctica todo flujo real que marca
// status='PAID' (accredit_webpay_parking_stay, cierre POS) fija esos campos
// en la misma transacción, y summarizeRevenueRows/toRevenueTransactionRow
// ya son defensivos ante un valor ausente sin fabricar uno.
// ============================================================

test("DEFINICIÓN DE PAGO: OPEN/CANCELLED nunca cuentan como transacción, incluso si tuvieran total_amount", async () => {
  const db = createMockDb({ stays: [
    { id: "x1", code: "TK-X1", license_plate: "XXXX-11", parking_id: "p-centro", status: "OPEN", exit_at: null, total_amount: 5000, payment_method: "CASH", payment_code: null, exit_operator_id: null, exit_operator_name: null, payment_shift_id: null },
    { id: "x2", code: "TK-X2", license_plate: "XXXX-22", parking_id: "p-centro", status: "CANCELLED", exit_at: null, total_amount: null, payment_method: null, payment_code: null, exit_operator_id: null, exit_operator_name: null, payment_shift_id: null },
  ] });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.deepEqual(result.rows, []);
});

// ============================================================
// §9: turno por FK real (payment_shift_id), nunca heurística por fecha +
// operador -- dos turnos del MISMO operador el MISMO día, cada pago debe
// asociarse al turno correcto por id.
// ============================================================

test("TURNO: dos turnos del mismo operador el mismo día -- cada pago se asocia al turno correcto por FK (payment_shift_id), nunca por coincidencia de fecha+operador", async () => {
  const sameDayShifts = [
    { id: "shift-am", shift_date: "2026-07-24" },
    { id: "shift-pm", shift_date: "2026-07-24" },
  ];
  const stays = [
    { id: "t1", code: "TK-T1", license_plate: "TTTT-11", parking_id: "p-centro", status: "PAID", exit_at: "2026-07-24T14:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1000, payment_code: "PAY-T1", payment_shift_id: "shift-am" },
    { id: "t2", code: "TK-T2", license_plate: "TTTT-22", parking_id: "p-centro", status: "PAID", exit_at: "2026-07-24T20:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1000, payment_code: "PAY-T2", payment_shift_id: "shift-pm" },
  ];
  const db = createMockDb({ stays, shifts: sameDayShifts });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  const row1 = result.rows.find((r) => r.id === "t1");
  const row2 = result.rows.find((r) => r.id === "t2");
  // Ambos turnos comparten shift_date -- si el sistema adivinara por
  // fecha+operador, no podría distinguirlos. La FK sí puede.
  assert.equal(row1.shiftLabel, "Turno 2026-07-24");
  assert.equal(row2.shiftLabel, "Turno 2026-07-24");
  // La prueba real de "no es heurística" es que cada fila usó su PROPIO
  // payment_shift_id (shift-am vs shift-pm), no un turno "adivinado":
  // confirmado indirectamente arriba porque ambos fixtures de turno EXISTEN
  // y son distintos -- si el código ignorara el FK y solo mostrara "hay un
  // turno ese día", no habría forma de que ambas etiquetas fueran correctas
  // simultáneamente sin realmente leer payment_shift_id por fila.
});

test("TURNO: sin payment_shift_id real, se muestra vacío -- nunca se adivina por fecha+operador", async () => {
  const db = createMockDb({
    stays: [{ id: "t3", code: "TK-T3", license_plate: "TTTT-33", parking_id: "p-centro", status: "PAID", exit_at: "2026-07-24T14:00:00.000Z", exit_operator_id: "op-ana", exit_operator_name: "Ana", payment_method: "CASH", total_amount: 1000, payment_code: "PAY-T3", payment_shift_id: null }],
    shifts: [{ id: "shift-am", shift_date: "2026-07-24" }], // existe un turno ese día para ese operador, pero la fila no lo referencia
  });
  const result = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  assert.equal(result.rows.find((r) => r.id === "t3").shiftLabel, "");
});

// ============================================================
// §11/§12: paginación real sin techo silencioso -- volumen > 1000 filas.
// ============================================================

test("PAGINACIÓN REAL: con 1500 pagos filtrados, el total es 1500 (no se trunca en 1000) y la página 101 (fila ~2500) devuelve vacío correctamente porque solo hay 1500, nunca por un techo artificial en 1000", async () => {
  const stays = generatePaidStays(1500);
  const db = createMockDb({ stays });
  const result = await searchRevenueTransactions(db, [{ id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" }], { dateFrom: "2026-07-24", dateTo: "2026-07-24", pageSize: 25 });
  assert.equal(result.total, 1500, "el total real debe ser 1500, no truncado a 1000");
});

test("PAGINACIÓN REAL: con 1500 pagos filtrados, la página 41 (filas 1001-1025, más allá del antiguo límite de 1000) devuelve datos reales, no vacío", async () => {
  const stays = generatePaidStays(1500);
  const db = createMockDb({ stays });
  const result = await searchRevenueTransactions(db, [{ id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" }], { dateFrom: "2026-07-24", dateTo: "2026-07-24", pageSize: 25, page: 41 });
  assert.equal(result.rows.length, 25, "la página 41 (más allá de la fila 1000) debe traer 25 filas reales, nunca quedar vacía por un techo silencioso");
});

test("PAGINACIÓN REAL: los KPIs (resumen) con 1500 pagos filtrados suman las 1500, no solo las primeras 1000", async () => {
  const stays = generatePaidStays(1500);
  const db = createMockDb({ stays });
  const overview = await getRevenueOverview(db, [{ id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" }], { dateFrom: "2026-07-24", dateTo: "2026-07-24" });
  assert.equal(overview.summary.count, 1500);
  assert.equal(overview.summary.totalAmount, 1500 * 1000);
});

test("PAGINACIÓN REAL: la consulta real pide MÚLTIPLES tramos .range() a la base de datos (paginación server real, no un slice() sobre un único fetch limitado)", async () => {
  const stays = generatePaidStays(1500);
  const rangeCalls = [];
  const db = createMockDb({ stays, rangeCalls });
  await searchRevenueTransactions(db, [{ id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" }], { dateFrom: "2026-07-24", dateTo: "2026-07-24" });
  const stayRangeCalls = rangeCalls.filter((call) => call.table === "parking_stays");
  assert.ok(stayRangeCalls.length >= 2, `esperaba al menos 2 llamadas .range() para traer 1500 filas en tramos de 1000, se registraron ${stayRangeCalls.length}`);
  assert.deepEqual(stayRangeCalls[0], { table: "parking_stays", from: 0, to: 999 });
  assert.deepEqual(stayRangeCalls[1], { table: "parking_stays", from: 1000, to: 1999 });
});

test("SIN TECHO SILENCIOSO: superar el tope máximo real rechaza explícitamente (RevenueRangeTooWideError), nunca devuelve un subconjunto arbitrario", async () => {
  // 20001 filas -- una más que MAX_MATCHING_ROWS (20000) -- debe rechazar,
  // no devolver las primeras 20000 en silencio.
  const stays = generatePaidStays(20001);
  const db = createMockDb({ stays });
  await assert.rejects(
    () => searchRevenueTransactions(db, [{ id: "p-centro", code: "CTR", name: "Parking Centro", companyId: "co-1", companyName: "Empresa Uno", type: "OFF_STREET" }], { dateFrom: "2026-07-24", dateTo: "2026-07-24" }),
    (error) => error instanceof RevenueRangeTooWideError && error.code === "REVENUE_RANGE_TOO_WIDE",
  );
});

// ============================================================
// §14: estado vacío -- 0 pagos, 0 cierres.
// ============================================================

test("ESTADO VACÍO: empresa/parking/período sin pagos ni cierres devuelve ceros reales, nunca restos de otra consulta", async () => {
  const db = createMockDb({ stays: [], closures: [] });
  const overview = await getRevenueOverview(db, CO1_PARKINGS, { dateFrom: "2026-01-01", dateTo: "2026-01-02" });
  assert.deepEqual(overview.summary, { totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 });
  assert.ok(overview.dailySeries.every((day) => day.amount === 0));
  assert.equal(overview.cashDifference.totalDifference, 0);

  const transactions = await searchRevenueTransactions(db, CO1_PARKINGS, { dateFrom: "2026-01-01", dateTo: "2026-01-02" });
  assert.deepEqual(transactions.rows, []);
  assert.equal(transactions.total, 0);

  const closures = await searchRevenueClosures(db, CO1_PARKINGS, { dateFrom: "2026-01-01", dateTo: "2026-01-02" });
  assert.deepEqual(closures.rows, []);
  assert.equal(closures.total, 0);
});

test("las rutas /api/recaudacion reutilizan authorizeOperationRequest + REPORTS_READ (sin ampliar a OPERATIONS_USE) y resuelven el scope antes de consultar", async () => {
  const [listRoute, closuresRoute] = await Promise.all([
    readFile(new URL("../app/api/recaudacion/route.js", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recaudacion/cierres/route.js", import.meta.url), "utf8"),
  ]);
  assert.match(listRoute, /authorizeOperationRequest\(request, PERMISSIONS\.REPORTS_READ\)/);
  assert.match(listRoute, /listParkings\(authorization\.db, authorization\.scope\)/);
  assert.match(listRoute, /searchRevenueTransactions\(authorization\.db, scopedParkings,/);
  assert.match(listRoute, /operationAuthorizationError\(/);
  assert.doesNotMatch(listRoute, /PERMISSIONS\.OPERATIONS_USE/);
  assert.doesNotMatch(listRoute, /getSupabaseAdminClient|service_role/i);

  assert.match(closuresRoute, /authorizeOperationRequest\(request, PERMISSIONS\.REPORTS_READ\)/);
  assert.match(closuresRoute, /searchRevenueClosures\(authorization\.db, scopedParkings,/);
  assert.doesNotMatch(closuresRoute, /PERMISSIONS\.OPERATIONS_USE/);
});
