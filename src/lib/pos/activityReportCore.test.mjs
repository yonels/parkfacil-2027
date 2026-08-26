import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_ACTIVITIES,
  statusForActivity,
  dateFieldForActivity,
  isValidIsoDate,
  validateReportFilters,
  normalizePagination,
  toActivityReportRow,
  summarizeReportRows,
  addDaysToIsoDate,
  operationalDateToIso,
  filterRowsByExactOperationalDateRange,
} from "./activityReportCore.mjs";

test("statusForActivity mapea a los estados reales de parking_stays; ingresos no filtra por status", () => {
  assert.equal(statusForActivity("pendientes"), "OPEN");
  assert.equal(statusForActivity("salidas"), "PAID");
  assert.equal(statusForActivity("anulados"), "CANCELLED");
  assert.equal(statusForActivity("ingresos"), null);
  assert.equal(statusForActivity(null), null);
  assert.equal(statusForActivity("inexistente"), null);
});

test("dateFieldForActivity: salidas ancla en exit_at, el resto en entry_at", () => {
  assert.equal(dateFieldForActivity("salidas"), "exit_at");
  for (const activity of ["ingresos", "pendientes", "anulados", null]) {
    assert.equal(dateFieldForActivity(activity), "entry_at");
  }
});

test("validateReportFilters acepta filtros vacíos/válidos y rechaza los inválidos", () => {
  assert.deepEqual(validateReportFilters({}), { ok: true, message: "" });
  assert.equal(validateReportFilters({ activity: "salidas" }).ok, true);
  assert.equal(validateReportFilters({ activity: "no-existe" }).ok, false);
  assert.equal(validateReportFilters({ dateFrom: "2026-07-01" }).ok, true);
  assert.equal(validateReportFilters({ dateFrom: "01-07-2026" }).ok, false); // formato incorrecto
  assert.equal(validateReportFilters({ dateFrom: "2026-07-28", dateTo: "2026-07-01" }).ok, false); // rango invertido
  assert.equal(validateReportFilters({ dateFrom: "2026-07-01", dateTo: "2026-07-28" }).ok, true);
  assert.equal(validateReportFilters({ paymentMethod: "CASH" }).ok, true);
  assert.equal(validateReportFilters({ paymentMethod: "DEBITO" }).ok, false); // no existe como valor real
  for (const activity of REPORT_ACTIVITIES) assert.equal(validateReportFilters({ activity }).ok, true);
});

test("normalizePagination aplica valores por defecto y limita pageSize a 100", () => {
  assert.deepEqual(normalizePagination({}), { page: 1, pageSize: 25, offset: 0 });
  assert.deepEqual(normalizePagination({ page: 3, pageSize: 10 }), { page: 3, pageSize: 10, offset: 20 });
  assert.deepEqual(normalizePagination({ page: 2, pageSize: 500 }), { page: 2, pageSize: 100, offset: 100 });
  assert.deepEqual(normalizePagination({ page: -1, pageSize: 0 }), { page: 1, pageSize: 25, offset: 0 });
  assert.deepEqual(normalizePagination({ page: "abc" }), { page: 1, pageSize: 25, offset: 0 });
});

test("toActivityReportRow proyecta una permanencia real (parking_stays) a la forma que consume el frontend", () => {
  const row = toActivityReportRow({
    id: "st-1",
    code: "ING-0001",
    license_plate: "CXPY-93",
    parking_id: "p-1",
    parking_name: "Parking Centro",
    status: "PAID",
    entry_at: "2026-07-28T12:46:00.000Z", // 08:46 America/Santiago
    exit_at: "2026-07-28T13:02:00.000Z", // 09:02 America/Santiago
    elapsed_minutes: 16,
    exit_operator_name: "Carolina Muñoz",
    entry_operator_name: "Felipe Soto",
    rate_name: "Tarifa E2E",
    net_amount: 403,
    tax_amount: 77,
    total_amount: 480,
    payment_method: "CASH",
  });
  assert.deepEqual(row, {
    id: "st-1", ticket: "ING-0001", plate: "CXPY-93", parkingId: "p-1", parkingName: "Parking Centro",
    status: "PAID", entryDate: "28-07-2026", entryTime: "08:46", exitDate: "28-07-2026", exitTime: "09:02",
    minutes: 16, operator: "Carolina Muñoz", rateName: "Tarifa E2E", netAmount: 403, taxAmount: 77,
    amount: 480, paymentMethod: "CASH",
  });
});

test("toActivityReportRow: permanencia OPEN sin salida deja exitDate/exitTime vacíos, no inventa datos", () => {
  const row = toActivityReportRow({ id: "st-2", license_plate: "FGFG-22", status: "OPEN", entry_at: "2026-07-28T12:00:00.000Z", exit_at: null });
  assert.equal(row.exitDate, "");
  assert.equal(row.exitTime, "");
  assert.equal(row.paymentMethod, null);
});

test("summarizeReportRows: contador y total exactos de las filas recibidas", () => {
  assert.deepEqual(summarizeReportRows([{ amount: 480 }, { amount: 2550 }, { amount: 1590 }]), { count: 3, totalAmount: 4620 });
  assert.deepEqual(summarizeReportRows([]), { count: 0, totalAmount: 0 });
});

test("addDaysToIsoDate suma/resta días en UTC puro", () => {
  assert.equal(addDaysToIsoDate("2026-07-28", 1), "2026-07-29");
  assert.equal(addDaysToIsoDate("2026-07-28", -1), "2026-07-27");
  assert.equal(addDaysToIsoDate("2026-07-31", 1), "2026-08-01"); // cruza mes
});

test("operationalDateToIso convierte DD-MM-YYYY a YYYY-MM-DD", () => {
  assert.equal(operationalDateToIso("28-07-2026"), "2026-07-28");
  assert.equal(operationalDateToIso("no-es-una-fecha"), null);
});

test("filterRowsByExactOperationalDateRange recorta la ventana ancha de la BD al rango exacto pedido (inclusivo)", () => {
  // Horarios a mediodía UTC para evitar ambigüedad de límite de día por el
  // desfase de huso horario (America/Santiago, UTC-3/UTC-4).
  const stays = [
    { id: "before", entry_at: "2026-07-26T15:00:00.000Z" }, // 26/07 en Santiago -> fuera de rango
    { id: "from", entry_at: "2026-07-27T15:00:00.000Z" }, // 27/07 en Santiago -> extremo inferior, incluido
    { id: "middle", entry_at: "2026-07-28T15:00:00.000Z" }, // 28/07 en Santiago -> dentro del rango
    { id: "after", entry_at: "2026-07-29T15:00:00.000Z" }, // 29/07 en Santiago -> fuera de rango
  ];
  const result = filterRowsByExactOperationalDateRange(stays, "entry_at", "2026-07-27", "2026-07-28");
  assert.deepEqual(result.map((s) => s.id).sort(), ["from", "middle"]);
});

test("filterRowsByExactOperationalDateRange sin dateFrom/dateTo devuelve todo sin filtrar", () => {
  const stays = [{ id: "x", entry_at: "2026-01-01T00:00:00.000Z" }];
  assert.deepEqual(filterRowsByExactOperationalDateRange(stays, "entry_at", null, null), stays);
});

test("filterRowsByExactOperationalDateRange descarta filas sin la fecha requerida", () => {
  const stays = [{ id: "y", entry_at: null }];
  assert.deepEqual(filterRowsByExactOperationalDateRange(stays, "entry_at", "2026-07-01", "2026-07-31"), []);
});
