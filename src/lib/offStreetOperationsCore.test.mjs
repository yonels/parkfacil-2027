import test from "node:test";
import assert from "node:assert/strict";
import {
  computeOperationsSummary,
  movementDateField,
  operationalTodayIso,
  originLabel,
  paymentMethodLabel,
  statusLabel,
  toOperationDetail,
  toOperationRow,
  validateOperationFilters,
} from "./offStreetOperationsCore.mjs";

test("statusLabel mapea exactamente los 3 estados reales de parking_stays", () => {
  assert.equal(statusLabel("OPEN"), "Abierto");
  assert.equal(statusLabel("PAID"), "Pagado");
  assert.equal(statusLabel("CANCELLED"), "Anulado");
  assert.equal(statusLabel("unknown"), "unknown");
  assert.equal(statusLabel(null), "—");
});

test("originLabel y paymentMethodLabel cubren los valores reales de entry_source/payment_method", () => {
  assert.equal(originLabel("WEB"), "Web");
  assert.equal(originLabel("POS"), "POS");
  assert.equal(originLabel(null), "—");
  assert.equal(paymentMethodLabel("CASH"), "Efectivo");
  assert.equal(paymentMethodLabel("CARD"), "Tarjeta");
  assert.equal(paymentMethodLabel(null), "—");
});

test("movementDateField: exits ancla en exit_at, cualquier otro valor en entry_at", () => {
  assert.equal(movementDateField("exits"), "exit_at");
  assert.equal(movementDateField("entries"), "entry_at");
  assert.equal(movementDateField("open"), "entry_at");
  assert.equal(movementDateField(null), "entry_at");
});

test("validateOperationFilters rechaza estado/movimiento/fechas fuera del modelo real", () => {
  assert.equal(validateOperationFilters({ status: "OPEN" }).ok, true);
  assert.equal(validateOperationFilters({ status: "open" }).ok, false); // sensible a mayúsculas -- el modelo real es OPEN, no open
  assert.equal(validateOperationFilters({ movement: "entries" }).ok, true);
  assert.equal(validateOperationFilters({ movement: "salidas" }).ok, false);
  assert.equal(validateOperationFilters({ dateFrom: "2026-07-01", dateTo: "2026-06-01" }).ok, false);
  assert.equal(validateOperationFilters({ dateFrom: "01-07-2026" }).ok, false);
  assert.equal(validateOperationFilters({ paymentMethod: "DEBIT" }).ok, false);
  assert.equal(validateOperationFilters({}).ok, true);
});

test("operationalTodayIso deriva 'hoy' de America/Santiago, no UTC", () => {
  // 2026-07-24T02:30:00Z es 2026-07-23 23:30 en Santiago (UTC-3 en horario de verano boreal / UTC-4 estándar) -- distinto día que en UTC.
  const iso = operationalTodayIso(new Date("2026-07-24T02:30:00.000Z"));
  assert.equal(iso, "2026-07-23");
});

test("toOperationRow mapea la fila real de parking_stays a la forma de UI, sin inventar campos", () => {
  const row = toOperationRow(
    {
      id: "stay-1",
      code: "TK-1001",
      license_plate: "ABCD-12",
      parking_id: "p-1",
      status: "PAID",
      entry_source: "POS",
      entry_at: "2026-07-24T12:00:00.000Z",
      exit_at: "2026-07-24T13:30:00.000Z",
      elapsed_minutes: 90,
      entry_operator_name: "Ana",
      exit_operator_name: "Beto",
      rate_name: "Tarifa hora",
      total_amount: 1500,
      payment_method: "CASH",
    },
    { parkingName: "Parking Centro", parkingCode: "CTR", companyName: "Empresa X" },
  );

  assert.equal(row.id, "stay-1");
  assert.equal(row.ticket, "TK-1001");
  assert.equal(row.plate, "ABCD-12");
  assert.equal(row.parkingName, "Parking Centro");
  assert.equal(row.companyName, "Empresa X");
  assert.equal(row.status, "PAID");
  assert.equal(row.origin, "POS");
  assert.equal(row.minutes, 90);
  assert.equal(row.entryOperator, "Ana");
  assert.equal(row.exitOperator, "Beto");
  assert.equal(row.amount, 1500);
  assert.equal(row.paymentMethod, "CASH");
});

test("toOperationRow no inventa fecha/hora de salida cuando exit_at es null (estadía OPEN)", () => {
  const row = toOperationRow({ id: "stay-1", code: "TK-1", license_plate: "AAAA-11", parking_id: "p-1", status: "OPEN", entry_at: "2026-07-24T12:00:00.000Z", exit_at: null });
  assert.equal(row.exitDate, "");
  assert.equal(row.exitTime, "");
});

test("computeOperationsSummary: vehículos dentro y tickets abiertos son el mismo dato real (status OPEN)", () => {
  const summary = computeOperationsSummary({
    openCount: 2,
    entriesToday: [{ id: "s3" }],
    exitsToday: [],
  });
  assert.equal(summary.vehiculosDentro, 2);
  assert.equal(summary.ticketsAbiertos, 2);
  assert.equal(summary.ingresosDia, 1);
  assert.equal(summary.salidasDia, 0);
});

test("computeOperationsSummary con listas vacías nunca lanza ni infla números", () => {
  const summary = computeOperationsSummary({});
  assert.deepEqual(summary, { ingresosDia: 0, salidasDia: 0, vehiculosDentro: 0, ticketsAbiertos: 0 });
});

test("toOperationDetail solo expone campos que existen en la fila real (cupón/turno ausentes -> null, no inventados)", () => {
  const detail = toOperationDetail(
    {
      id: "stay-1", code: "TK-1001", license_plate: "ABCD-12", qr_token: "qr-abc", status: "OPEN", entry_source: "WEB",
      entry_at: "2026-07-24T12:00:00.000Z", exit_at: null, entry_operator_name: "Ana",
      elapsed_minutes: null, rate_name: null, subtotal_amount: null, discount_amount: 0, net_amount: null, tax_amount: null, total_amount: null,
      payment_method: null, payment_code: null, coupon_code: null,
    },
    { parking: { id: "p-1", name: "Parking Centro", code: "CTR", companyId: "co-1", companyName: "Empresa X" }, entryShift: null, paymentShift: null },
  );

  assert.equal(detail.ticket, "TK-1001");
  assert.equal(detail.company.name, "Empresa X");
  assert.equal(detail.parking.code, "CTR");
  assert.equal(detail.exit, null);
  assert.equal(detail.coupon, null);
  assert.equal(detail.entry.shiftDate, null);
});

test("toOperationDetail incluye cupón y turno cuando existen realmente", () => {
  const detail = toOperationDetail(
    {
      id: "stay-2", code: "TK-1002", license_plate: "ZZZZ-99", qr_token: "qr-zzz", status: "PAID", entry_source: "POS",
      entry_at: "2026-07-24T12:00:00.000Z", exit_at: "2026-07-24T13:00:00.000Z", entry_operator_name: "Ana", exit_operator_name: "Beto",
      elapsed_minutes: 60, rate_name: "Tarifa hora", subtotal_amount: 2000, discount_amount: 500, net_amount: 1260, tax_amount: 240, total_amount: 1500,
      payment_method: "CASH", payment_code: "PAY-1", coupon_code: "PROMO10",
    },
    {
      parking: { id: "p-1", name: "Parking Centro", code: "CTR", companyId: "co-1", companyName: "Empresa X" },
      entryShift: { shift_date: "2026-07-24" },
      paymentShift: { shift_date: "2026-07-24" },
    },
  );

  assert.equal(detail.coupon.code, "PROMO10");
  assert.equal(detail.entry.shiftDate, "2026-07-24");
  assert.equal(detail.exit.shiftDate, "2026-07-24");
  assert.equal(detail.billing.discountAmount, 500);
  assert.equal(detail.billing.totalAmount, 1500);
});
