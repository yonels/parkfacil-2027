import test from "node:test";
import assert from "node:assert/strict";
import { filterPaidStaysForOperationalDay, summarizeDailyPayments, toDailyPaymentRow } from "./paymentsDayCore.mjs";

const now = new Date("2026-08-17T20:00:00.000Z"); // 16:00 America/Santiago (UTC-4 en agosto)

test("PAGOS DEL DÍA: filtra solo estadías PAID cerradas en el día operacional actual", () => {
  const stays = [
    { id: "1", status: "PAID", exit_at: "2026-08-17T13:05:00.000Z" }, // 09:05 hoy en Santiago
    { id: "2", status: "PAID", exit_at: "2026-08-16T23:50:00.000Z" }, // ayer en Santiago
    { id: "3", status: "OPEN", exit_at: null },
    { id: "4", status: "PAID", exit_at: "2026-08-17T23:59:00.000Z" }, // 19:59 hoy en Santiago
  ];
  const result = filterPaidStaysForOperationalDay(stays, { now });
  assert.deepEqual(result.map((s) => s.id), ["1", "4"]);
});

test("PAGOS DEL DÍA: sin estadías, retorna lista vacía", () => {
  assert.deepEqual(filterPaidStaysForOperationalDay([], { now }), []);
  assert.deepEqual(filterPaidStaysForOperationalDay(null, { now }), []);
});

test("PAGOS DEL DÍA: totales se calculan solo desde CASH; débito/crédito no se inventan", () => {
  const stays = [
    { total_amount: 2000, payment_method: "CASH" },
    { total_amount: 3500, payment_method: "CASH" },
    { total_amount: 1200, payment_method: "CARD" }, // no distinguible como débito/crédito hoy
  ];
  const totals = summarizeDailyPayments(stays);
  assert.deepEqual(totals, { totalAmount: 6700, totalCash: 5500, totalDebit: 0, totalCredit: 0, totalUnclassifiedCard: 1200, count: 3 });
});

test("PAGOS DEL DÍA: totales en cero cuando no hay pagos", () => {
  assert.deepEqual(summarizeDailyPayments([]), { totalAmount: 0, totalCash: 0, totalDebit: 0, totalCredit: 0, totalUnclassifiedCard: 0, count: 0 });
});

test("PAGOS DEL DÍA: proyecta fila mínima (patente, hora, medio, monto)", () => {
  const row = toDailyPaymentRow({
    id: "s1",
    license_plate: "CXPY-93",
    exit_at: "2026-08-17T13:05:00.000Z",
    payment_method: "CASH",
    total_amount: 2500,
    code: "ING-1234",
    payment_code: "PAG-5678",
  });
  assert.deepEqual(row, {
    id: "s1",
    plate: "CXPY-93",
    time: "09:05",
    paymentMethod: "CASH",
    amount: 2500,
    ticketNumber: "ING-1234",
    paymentCode: "PAG-5678",
  });
});

test("IMPRIMIR PAGOS DEL DÍA: payload PAYMENTS_DAY con los totales/filas del servidor", async () => {
  const { buildPaymentsDayPrintPayload } = await import("./paymentsDayCore.mjs");
  const parking = { name: "Clínica Ramis Central", code: "PF-001", company: { business_name: "Clínica Ramis SpA" } };
  const payments = [{ plate: "CXPY93", time: "17:10", paymentMethod: "CASH", amount: 1240, ticketNumber: "ING-1" }];
  const totals = { totalAmount: 1240, totalCash: 1240, totalDebit: 0, totalCredit: 0, count: 1 };
  const payload = buildPaymentsDayPrintPayload({ payments, totals, parking, now: new Date("2026-09-28T22:30:00Z") });
  assert.equal(payload.type, "PAYMENTS_DAY");
  assert.equal(payload.companyName, "Clínica Ramis SpA");
  assert.equal(payload.parkingName, "Clínica Ramis Central");
  assert.equal(payload.generatedDate, "28-09-2026");
  assert.equal(payload.generatedTime, "19:30");
  assert.equal(payload.totalAmount, 1240);
  assert.equal(payload.count, 1);
  assert.deepEqual(payload.payments[0], { plate: "CXPY93", time: "17:10", paymentMethod: "CASH", amount: 1240, ticketNumber: "ING-1" });
  assert.equal(buildPaymentsDayPrintPayload({ payments, totals, parking: null }), null);
  assert.equal(buildPaymentsDayPrintPayload({ payments: [], totals: null, parking }).count, 0);
});
