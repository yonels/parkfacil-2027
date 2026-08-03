import test from "node:test";
import assert from "node:assert/strict";
import { calculateParkingCharge, calculateScheduledParkingCharge, validateOperationalRate } from "./parkingRates.mjs";

test("minuto efectivo nunca redondea al alza", () => {
  const result = calculateParkingCharge({ billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100 }, 61);
  assert.equal(result.amount, 101);
});

test("período gratuito conserva tiempo real pero descuenta tiempo cobrable", () => {
  const result = calculateParkingCharge({ billingMode: "EFFECTIVE_MINUTE", minuteAmount: 60, freePeriodSeconds: 600 }, 900);
  assert.equal(result.elapsedSeconds, 900);
  assert.equal(result.chargeableSeconds, 300);
  assert.equal(result.amount, 300);
});

test("primer tramo exige al menos treinta minutos", () => {
  const errors = validateOperationalRate({ billingMode: "EXPIRED_BLOCKS", blocks: [{ sequence: 1, durationSeconds: 1200, amount: 1000 }] });
  assert.ok(errors.block_1);
});

test("tramos posteriores exigen al menos diez minutos", () => {
  const errors = validateOperationalRate({ billingMode: "EXPIRED_BLOCKS", blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000 }, { sequence: 2, durationSeconds: 300, amount: 200 }] });
  assert.ok(errors.block_2);
});

test("solo cobra tramos completamente vencidos", () => {
  const rate = { billingMode: "EXPIRED_BLOCKS", blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000 }, { sequence: 2, durationSeconds: 600, amount: 300, repeatAfter: true }] };
  const result = calculateParkingCharge(rate, 47 * 60);
  assert.equal(result.amount, 1300);
  assert.equal(result.unchargedSeconds, 7 * 60);
});

test("no cobra un tramo posterior antes de vencer el tramo inicial", () => {
  const rate = { billingMode: "EXPIRED_BLOCKS", blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000, repeatAfter: false }, { sequence: 2, durationSeconds: 600, amount: 300, repeatAfter: true }] };
  const result = calculateParkingCharge(rate, 15 * 60);
  assert.equal(result.amount, 0);
  assert.equal(result.unchargedSeconds, 15 * 60);
});

test("un segundo incompleto nunca se aproxima al alza", () => {
  const rate = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100 };
  assert.equal(calculateParkingCharge(rate, 1).amount, 1);
  assert.equal(calculateParkingCharge(rate, 59).amount, 98);
});

test("plazas multiplican tarifa solo cuando la política lo indica", () => {
  const base = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100 };
  assert.equal(calculateParkingCharge(base, 60, 3).amount, 100);
  assert.equal(calculateParkingCharge({ ...base, multiplyBySpaces: true }, 60, 3).amount, 300);
});

test("estadía nocturna cobra un único valor y separa el tiempo regular", () => {
  const rate = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 60, freePeriodSeconds: 0, regularStartTime: "08:00", regularEndTime: "22:00", overnightEndTime: "08:00", overnightFlatAmount: 5000 };
  const result = calculateScheduledParkingCharge(rate, "2026-08-02T21:00:00-04:00", "2026-08-03T09:00:00-04:00");
  assert.equal(result.overnightPeriods, 1);
  assert.equal(result.overnightAmount, 5000);
  assert.equal(result.amount, 5000 + 120 * 60);
});

test("los minutos gratis se descuentan del período regular", () => {
  const rate = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100, freePeriodSeconds: 10 * 60, regularStartTime: "08:00", regularEndTime: "22:00", overnightEndTime: "08:00", overnightFlatAmount: 4000 };
  const result = calculateScheduledParkingCharge(rate, "2026-08-02T20:00:00-04:00", "2026-08-02T20:30:00-04:00");
  assert.equal(result.amount, 2000);
  assert.equal(result.overnightPeriods, 0);
});
