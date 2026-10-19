import test from "node:test";
import assert from "node:assert/strict";
import { toOperationalDateTimeParts } from "../dataEntry.mjs";
import { receiptChargeLines, receiptExitInstant } from "./paymentReceiptCore.mjs";

// Caso real de QA (AAAA-95, 2026-10-18): cálculo de cobro 21:11, pago confirmado 21:12:14.
const stay = { entry_at: "2026-10-18T17:23:06.310Z", exit_at: "2026-10-19T00:12:14.707Z" };
const breakdown = {
  kind: "TIME_BANDS", amount: 9545, chargedMinutes: 408,
  passes: [
    { from: "2026-10-18T17:23:06.310Z", to: "2026-10-18T19:00:06.310Z", label: "tarde", minutes: 97, minuteAmount: 25, amount: 2425, capApplied: false },
    { from: "2026-10-18T19:00:06.310Z", to: "2026-10-18T22:00:06.310Z", label: "Noche", minutes: 180, minuteAmount: 25, amount: 4500, capApplied: false },
    { from: "2026-10-18T22:00:06.310Z", to: "2026-10-19T00:11:06.310Z", label: "Franja 4", minutes: 131, minuteAmount: 20, amount: 2620, capApplied: false },
  ],
};
const quote = { elapsedMinutes: 408, snapshot: { calculatedAt: "2026-10-19T00:11:40.000Z", chargeBreakdown: breakdown } };

test("Salida impresa = hora del cálculo de cobro y cuadra con Tiempo", () => {
  const exit = receiptExitInstant(stay, quote);
  assert.equal(toOperationalDateTimeParts(exit).entryTime, "21:11");
  const entry = toOperationalDateTimeParts(stay.entry_at).entryTime;
  const [eh, em] = entry.split(":").map(Number);
  const [xh, xm] = toOperationalDateTimeParts(exit).entryTime.split(":").map(Number);
  assert.equal((xh * 60 + xm) - (eh * 60 + em), quote.elapsedMinutes);
});

test("Entrada → Salida cuadra con Tiempo aunque los segundos crucen de minuto", () => {
  const late = { entry_at: "2026-10-18T17:23:50.000Z" };
  const q = { elapsedMinutes: 407, snapshot: { calculatedAt: "2026-10-19T00:11:20.000Z" } };
  const entry = toOperationalDateTimeParts(late.entry_at).entryTime.split(":").map(Number);
  const exit = toOperationalDateTimeParts(receiptExitInstant(late, q)).entryTime.split(":").map(Number);
  assert.equal((exit[0] * 60 + exit[1]) - (entry[0] * 60 + entry[1]), 407);
});

test("sin minutos cobrados usa la hora del cálculo y, si falta, la salida registrada", () => {
  assert.equal(receiptExitInstant(stay, { snapshot: { calculatedAt: "2026-10-19T00:11:40.000Z" } }), "2026-10-19T00:11:40.000Z");
  assert.equal(receiptExitInstant(stay, null), stay.exit_at);
});

test("una línea por franja horaria; los montos suman el total", () => {
  const lines = receiptChargeLines(breakdown);
  assert.deepEqual(lines.map((l) => `${l.from}-${l.to} ${l.minutes} x ${l.minuteAmount} = ${l.amount}`), [
    "14:23-16:00 97 x 25 = 2425",
    "16:00-19:00 180 x 25 = 4500",
    "19:00-21:11 131 x 20 = 2620",
  ]);
  assert.equal(lines.reduce((sum, l) => sum + l.amount, 0), breakdown.amount);
  assert.equal(lines.reduce((sum, l) => sum + l.minutes, 0), quote.elapsedMinutes);
});

test("sin franjas horarias no hay detalle", () => {
  assert.deepEqual(receiptChargeLines(null), []);
  assert.deepEqual(receiptChargeLines({ kind: "OTHER", passes: [] }), []);
});
