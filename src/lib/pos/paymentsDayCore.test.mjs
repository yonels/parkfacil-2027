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
  assert.deepEqual(totals, { totalAmount: 6700, totalCash: 5500, totalDebit: 0, totalCredit: 0, count: 3 });
});

test("PAGOS DEL DÍA: totales en cero cuando no hay pagos", () => {
  assert.deepEqual(summarizeDailyPayments([]), { totalAmount: 0, totalCash: 0, totalDebit: 0, totalCredit: 0, count: 0 });
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
