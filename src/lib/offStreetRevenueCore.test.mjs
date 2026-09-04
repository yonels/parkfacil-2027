import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyRevenueSeries,
  operationalTodayIso,
  paymentMethodLabel,
  REVENUE_PAYMENT_METHODS,
  summarizeCashDifferences,
  summarizeRevenueRows,
  toRevenueClosureRow,
  toRevenueTransactionRow,
  validateRevenueFilters,
} from "./offStreetRevenueCore.mjs";

test("REVENUE_PAYMENT_METHODS reutiliza exactamente REPORT_PAYMENT_METHODS (CASH/CARD reales, sin inventar débito/crédito)", () => {
  assert.deepEqual(REVENUE_PAYMENT_METHODS, ["CASH", "CARD"]);
});

test("paymentMethodLabel es el mismo helper real reutilizado de offStreetOperationsCore (Fase 1), no una copia", () => {
  assert.equal(paymentMethodLabel("CASH"), "Efectivo");
  assert.equal(paymentMethodLabel("CARD"), "Tarjeta");
  assert.equal(paymentMethodLabel(null), "—");
});

test("validateRevenueFilters rechaza fechas y medios de pago fuera del modelo real", () => {
  assert.equal(validateRevenueFilters({}).ok, true);
  assert.equal(validateRevenueFilters({ dateFrom: "2026-07-01", dateTo: "2026-06-01" }).ok, false);
  assert.equal(validateRevenueFilters({ dateFrom: "01-07-2026" }).ok, false);
  assert.equal(validateRevenueFilters({ paymentMethod: "DEBIT" }).ok, false);
  assert.equal(validateRevenueFilters({ paymentMethod: "CASH" }).ok, true);
});

test("operationalTodayIso deriva 'hoy' de America/Santiago", () => {
  assert.equal(operationalTodayIso(new Date("2026-07-24T02:30:00.000Z")), "2026-07-23");
});

test("toRevenueTransactionRow mapea la fila real PAID a la forma de UI, con turno ya resuelto por el llamador", () => {
  const row = toRevenueTransactionRow(
    { id: "s1", code: "TK-1", license_plate: "AAAA-11", parking_id: "p-1", status: "PAID", exit_at: "2026-07-24T13:30:00.000Z", exit_operator_name: "Beto", payment_method: "CASH", total_amount: 1500, payment_code: "PAY-1" },
    { parkingName: "Parking Centro", companyName: "Empresa X", shiftLabel: "Turno 24-07-2026" },
  );
  assert.equal(row.ticket, "TK-1");
  assert.equal(row.plate, "AAAA-11");
  assert.equal(row.operator, "Beto");
  assert.equal(row.paymentCode, "PAY-1");
  assert.equal(row.shiftLabel, "Turno 24-07-2026");
  assert.equal(row.amount, 1500);
  assert.equal(row.status, "PAID");
});

test("summarizeRevenueRows: total/efectivo/tarjeta/cantidad/ticket promedio calculados correctamente, sin inventar débito", () => {
  const summary = summarizeRevenueRows([
    { payment_method: "CASH", total_amount: 1000 },
    { payment_method: "CARD", total_amount: 2000 },
    { payment_method: "CARD", total_amount: 3000 },
  ]);
  assert.equal(summary.totalAmount, 6000);
  assert.equal(summary.cashAmount, 1000);
  assert.equal(summary.cardAmount, 5000);
  assert.equal(summary.count, 3);
  assert.equal(summary.averageTicket, 2000);
});

test("summarizeRevenueRows con lista vacía nunca lanza ni infla números", () => {
  assert.deepEqual(summarizeRevenueRows([]), { totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 });
  assert.deepEqual(summarizeRevenueRows(undefined), { totalAmount: 0, cashAmount: 0, cardAmount: 0, count: 0, averageTicket: 0 });
});

test("buildDailyRevenueSeries incluye todos los días del rango (incluso recaudación 0), en orden ascendente", () => {
  const series = buildDailyRevenueSeries(
    [
      { exit_at: "2026-07-24T15:00:00.000Z", total_amount: 1000 }, // 24/07 en Santiago (UTC-4 en julio)
      { exit_at: "2026-07-24T20:00:00.000Z", total_amount: 500 },
    ],
    "2026-07-23",
    "2026-07-25",
  );
  assert.deepEqual(series.map((item) => item.date), ["2026-07-23", "2026-07-24", "2026-07-25"]);
  assert.equal(series.find((item) => item.date === "2026-07-24").amount, 1500);
  assert.equal(series.find((item) => item.date === "2026-07-23").amount, 0);
});

test("buildDailyRevenueSeries sin rango devuelve vacío (nunca inventa un rango implícito)", () => {
  assert.deepEqual(buildDailyRevenueSeries([{ exit_at: "2026-07-24T15:00:00.000Z", total_amount: 1000 }], null, null), []);
});

test("summarizeCashDifferences suma diferencias reales y cuenta cierres con diferencia distinta de cero", () => {
  const closures = [
    { cashDifference: 0 },
    { cashDifference: -1500 },
    { cashDifference: 500 },
    { cashDifference: null },
  ];
  const result = summarizeCashDifferences(closures);
  assert.equal(result.totalDifference, -1000);
  assert.equal(result.closuresWithDifference, 2);
});

test("toRevenueClosureRow reproyecta la fila real de shift_closures sin recalcular montos", () => {
  const row = toRevenueClosureRow({
    id: "c1", shift_id: "sh1", folio: "CT-1", parking_id: "p-1", parking_name: "Parking Centro", company_name: "Empresa X",
    operator_name: "Ana", shift_date: "2026-07-24", actual_start_at: "2026-07-24T12:00:00Z", actual_close_at: "2026-07-24T20:00:00Z",
    paid_vehicles_count: 10, cancelled_vehicles_count: 0, pending_vehicles_count: 2,
    cash_amount: 5000, card_amount: 15000, collected_amount: 20000, declared_cash_amount: 4800, cash_difference: -200,
    difference_observation: "Faltante de caja chica", closure_status: "CONFIRMED", confirmed_by: "user-1", confirmed_at: "2026-07-24T20:01:00Z",
  });
  assert.equal(row.folio, "CT-1");
  assert.equal(row.companyName, "Empresa X");
  assert.equal(row.parkingName, "Parking Centro");
  assert.equal(row.operator, "Ana");
  assert.equal(row.grossAmount, 20000);
  assert.equal(row.cashDifference, -200);
  assert.equal(row.status, "CONFIRMED");
  assert.equal(row.cancelledPaymentsCount, 0); // real: siempre 0 para off-street (sin mecanismo de anulación financiera)
});

test("toRevenueClosureRow no inventa un operador cuando falta operator_name (cae al operator_id real)", () => {
  const row = toRevenueClosureRow({ id: "c1", operator_id: "op-123", operator_name: null });
  assert.equal(row.operator, "op-123");
});
