import test from "node:test";
import assert from "node:assert/strict";
import { toOperationalDateTimeParts } from "../dataEntry.mjs";
import { receiptChargeLines, receiptExitInstant } from "./paymentReceiptCore.mjs";

// Caso real de QA (AAAA-95, 2026-10-18): cálculo de cobro 21:11, pago confirmado 21:12:14.
const stay = { entry_at: "2026-10-18T17:23:06.310Z", exit_at: "2026-10-19T00:12:14.707Z" };
const breakdown = {
  kind: "TIME_BANDS", amount: 9545, chargedMinutes: 408,
  passes: [
    { from: "2026-10-18T17:23:06.310Z", to: "2026-10-18T19:00:06.310Z", label: "tarde", setLabel: "Todos los días", bandStart: "12:00", bandEnd: "16:00", capAmount: null, minutes: 97, minuteAmount: 25, amount: 2425, capApplied: false },
    { from: "2026-10-18T19:00:06.310Z", to: "2026-10-18T22:00:06.310Z", label: "Noche", setLabel: "Todos los días", bandStart: "16:00", bandEnd: "19:00", capAmount: null, minutes: 180, minuteAmount: 25, amount: 4500, capApplied: false },
    { from: "2026-10-18T22:00:06.310Z", to: "2026-10-19T00:11:06.310Z", label: "Franja 4", setLabel: "Todos los días", bandStart: "19:00", bandEnd: "07:00", capAmount: 10000, minutes: 131, minuteAmount: 20, amount: 2620, capApplied: false },
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

const fmt = (l) => `${l.from}-${l.to} ${l.label} ${l.minutes} x ${l.minuteAmount} = ${l.amount}${l.capCount ? ` tope x${l.capCount}` : ""}`;

test("estadía corta: una línea por franja horaria; minutos y montos cuadran", () => {
  const lines = receiptChargeLines(breakdown);
  assert.deepEqual(lines.map(fmt), [
    "12:00-16:00 tarde 97 x 25 = 2425",
    "16:00-19:00 Noche 180 x 25 = 4500",
    "19:00-07:00 Franja 4 131 x 20 = 2620",
  ]);
  assert.equal(lines.reduce((sum, l) => sum + l.amount, 0), breakdown.amount);
  assert.equal(lines.reduce((sum, l) => sum + l.minutes, 0), quote.elapsedMinutes);
});

// Caso real de QA (BBBB-10): 7 días, 30 tramos de cobro, tope nocturno aplicado 7 veces.
test("estadía de varios días: se agrupa por franja horaria (4 líneas) y cuadra con el total", () => {
  const band = (label, bandStart, bandEnd, minuteAmount, capAmount) => ({ label, bandStart, bandEnd, minuteAmount, capAmount, setLabel: "Todos los días" });
  const dia = band("Día", "07:00", "12:00", 35, null), tarde = band("tarde", "12:00", "16:00", 25, null);
  const noche = band("Noche", "16:00", "19:00", 25, null), f4 = band("Franja 4", "19:00", "07:00", 20, 10000);
  const passes = [{ ...noche, minutes: 73, amount: 1825 }, { ...f4, minutes: 720, amount: 10000, capApplied: true }];
  for (let day = 12; day <= 17; day += 1) passes.push({ ...dia, minutes: 300, amount: 10500 }, { ...tarde, minutes: 240, amount: 6000 }, { ...noche, minutes: 180, amount: 4500 }, { ...f4, minutes: 720, amount: 10000, capApplied: true });
  passes.push({ ...dia, minutes: 300, amount: 10500 }, { ...tarde, minutes: 240, amount: 6000 }, { ...noche, minutes: 180, amount: 4500 }, { ...f4, minutes: 167, amount: 3340 });
  const long = { kind: "TIME_BANDS", amount: 222165, chargedMinutes: 10320, passes };
  assert.equal(passes.length, 30);
  const lines = receiptChargeLines(long);
  assert.deepEqual(lines.map(fmt), [
    "07:00-12:00 Día 2100 x 35 = 73500",
    "12:00-16:00 tarde 1680 x 25 = 42000",
    "16:00-19:00 Noche 1333 x 25 = 33325",
    "19:00-07:00 Franja 4 5207 x 20 = 73340 tope x7",
  ]);
  assert.equal(lines.reduce((sum, l) => sum + l.amount, 0), 222165);
  assert.equal(lines.reduce((sum, l) => sum + l.minutes, 0), 10320);
});

test("sin franjas horarias no hay detalle", () => {
  assert.deepEqual(receiptChargeLines(null), []);
  assert.deepEqual(receiptChargeLines({ kind: "OTHER", passes: [] }), []);
});
