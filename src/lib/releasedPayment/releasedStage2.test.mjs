import test from "node:test";
import assert from "node:assert/strict";

import { parseMinuteOfDay } from "../parkingTimeBands.mjs";
import { endOfLocalDayMs, uncoveredIntervalsBetween } from "./authorizationCore.mjs";
import { quoteUncoveredIntervals } from "./releasedChargeCore.mjs";
import { authorizationUsableToday, ENTRY_DECISION, evaluateReleasedEntry, releasedStayCoverage } from "./releasedStayCore.mjs";

// SOL-2026-10-16-003, Etapa 2 (paso 2.4). Octubre 2026: Chile en UTC-3;
// 2026-10-12 es lunes.
const at = (date, time) => new Date(`${date}T${time}:00-03:00`);
const ms = (date, time) => at(date, time).getTime();

const recurring = (from, to, windows, extra = {}) => ({ id: "r1", kind: "RECURRING", status: "ACTIVE", validFrom: from.toISOString(), validTo: to.toISOString(), schedule: windows, version: 1, paid: true, ...extra });
const continuous = (from, to, extra = {}) => ({ id: "c1", kind: "CONTINUOUS", status: "ACTIVE", validFrom: from.toISOString(), validTo: to.toISOString(), schedule: [], version: 1, paid: true, ...extra });
const lunesAViernes = [{ days: [1, 2, 3, 4, 5], start: "08:30", end: "12:30" }];

test("intervalos no cubiertos: entra 08:00, franja 08:30–12:30, sale 14:00 → 08:00–08:30 y 12:30–14:00", () => {
  const auth = recurring(at("2026-10-01", "00:00"), at("2027-10-01", "00:00"), lunesAViernes);
  const intervals = uncoveredIntervalsBetween([auth], at("2026-10-12", "08:00"), at("2026-10-12", "14:00"));
  assert.deepEqual(intervals, [[ms("2026-10-12", "08:00"), ms("2026-10-12", "08:30")], [ms("2026-10-12", "12:30"), ms("2026-10-12", "14:00")]]);
  const coverage = releasedStayCoverage({ timeZone: "America/Santiago", contract: { endsAt: null }, authorizations: [auth] }, at("2026-10-12", "08:00"), at("2026-10-12", "14:00"));
  assert.equal(coverage.coveredSeconds, 4 * 3600);
  assert.equal(coverage.chargeableSeconds, 2 * 3600);
  assert.equal(coverage.uncovered.length, 2);
});

test("intervalos no cubiertos: todo cubierto → ninguno; contratación vencida durante la estadía → cola no cubierta", () => {
  const auth = continuous(at("2026-10-12", "00:00"), at("2026-10-13", "00:00"));
  assert.deepEqual(uncoveredIntervalsBetween([auth], at("2026-10-12", "09:00"), at("2026-10-12", "10:00")), []);
  const coverage = releasedStayCoverage({ contract: { endsAt: at("2026-10-12", "09:30").toISOString() }, authorizations: [auth] }, at("2026-10-12", "09:00"), at("2026-10-12", "10:00"));
  assert.deepEqual(coverage.uncovered, [[ms("2026-10-12", "09:30"), ms("2026-10-12", "10:00")]]);
});

test("fin del día local y uso hoy (P8c: mismo día calendario)", () => {
  assert.equal(endOfLocalDayMs(at("2026-10-12", "15:00")), ms("2026-10-13", "00:00"));
  const now = at("2026-10-12", "08:00");
  assert.equal(authorizationUsableToday(continuous(at("2026-10-12", "08:30"), at("2026-10-12", "18:00")), now), true, "comienza más tarde hoy");
  assert.equal(authorizationUsableToday(continuous(at("2026-10-13", "08:00"), at("2026-10-14", "08:00")), now), false, "comienza mañana");
  assert.equal(authorizationUsableToday(continuous(at("2026-10-11", "08:00"), at("2026-10-12", "07:00")), now), false, "ya venció");
  const anual = recurring(at("2026-10-01", "00:00"), at("2027-10-01", "00:00"), lunesAViernes);
  assert.equal(authorizationUsableToday(anual, now), true, "franja horaria pendiente hoy (lunes)");
  assert.equal(authorizationUsableToday(anual, at("2026-10-12", "13:00")), false, "franja horaria de hoy ya pasó");
  assert.equal(authorizationUsableToday(anual, at("2026-10-17", "09:00")), false, "sábado sin franja horaria");
});

test("ingreso: exige pago; sin pago, cupo o fuera del día → ingreso normal con mensaje", () => {
  const moduleState = { enabled: true, operationalSpots: 1 };
  const contract = { id: "k1", version: 1, startsAt: at("2026-10-01", "00:00").toISOString(), endsAt: at("2027-10-01", "00:00").toISOString(), timeZone: "America/Santiago" };
  const now = at("2026-10-12", "08:00");
  const pagada = continuous(at("2026-10-12", "08:30"), at("2026-10-12", "18:00"));
  const ok = evaluateReleasedEntry({ module: moduleState, contract, authorizations: [pagada], openReleasedStays: 0, now });
  assert.equal(ok.decision, ENTRY_DECISION.ELIGIBLE);
  assert.equal(ok.snapshot.version, 4);
  assert.equal(ok.snapshot.authorizations.length, 1);
  const impaga = evaluateReleasedEntry({ module: moduleState, contract, authorizations: [{ ...pagada, paid: false }], openReleasedStays: 0, now });
  assert.equal(impaga.decision, ENTRY_DECISION.UNPAID);
  assert.match(impaga.message, /pago pendiente/);
  assert.equal(evaluateReleasedEntry({ module: moduleState, contract, authorizations: [pagada], openReleasedStays: 1, now }).decision, ENTRY_DECISION.NO_SPOTS);
  assert.equal(evaluateReleasedEntry({ module: moduleState, contract, authorizations: [continuous(at("2026-10-13", "08:00"), at("2026-10-14", "08:00"))], openReleasedStays: 0, now }).decision, ENTRY_DECISION.AUTHORIZATION_NOT_CURRENT);
  assert.equal(evaluateReleasedEntry({ module: { ...moduleState, enabled: false }, contract, authorizations: [pagada], openReleasedStays: 0, now }).decision, ENTRY_DECISION.MODULE_UNAVAILABLE);
  // Una impaga no cubre tiempo aunque otra pagada habilite el ingreso.
  const mixta = evaluateReleasedEntry({ module: moduleState, contract, authorizations: [pagada, { ...continuous(at("2026-10-12", "00:00"), at("2026-10-13", "00:00")), id: "c2", paid: false }], openReleasedStays: 0, now });
  assert.deepEqual(mixta.snapshot.authorizations.map((item) => item.id), ["c1"]);
});

// Tarifa clásica: $20 por minuto efectivo, 10 minutos de gracia.
const CLASSIC = { id: "rate-1", name: "Minuto", billingMode: "EFFECTIVE_MINUTE", minuteAmount: 20, freePeriodSeconds: 600, status: "ACTIVE", legalComplianceAccepted: true, blocks: [] };

test("excedente (P8a): cada intervalo por separado; minutos de gracia una sola vez por estadía", () => {
  const intervals = [[ms("2026-10-12", "08:00"), ms("2026-10-12", "08:30")], [ms("2026-10-12", "12:30"), ms("2026-10-12", "14:00")]];
  const result = quoteUncoveredIntervals({ rate: CLASSIC, intervals });
  assert.equal(result.valid, true, JSON.stringify(result));
  // (30 − 10 de gracia) × 20 = 400; 90 × 20 = 1.800.
  assert.deepEqual(result.intervals.map((item) => item.amount), [400, 1800]);
  assert.equal(result.amount, 2200);
  assert.deepEqual(quoteUncoveredIntervals({ rate: CLASSIC, intervals: [] }), { valid: true, amount: 0, chargedSeconds: 0, intervals: [] });
  assert.equal(quoteUncoveredIntervals({ rate: null, intervals }).reason, "ACTIVE_RATE_NOT_FOUND");
});

test("excedente (P8a) con franjas horarias: precio según la hora real y tope de la franja horaria", () => {
  const band = (label, start, end, minuteAmount, capAmount = null) => ({ label, startMinute: parseMinuteOfDay(start), endMinute: parseMinuteOfDay(end), minuteAmount, capAmount });
  const rate = {
    ...CLASSIC, freePeriodSeconds: 0, minuteAmount: null, timeBandsEnabled: true,
    bandSets: [{ label: "Todos los días", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], appliesToHolidays: false, bands: [band("Día", "07:00", "17:00", 35), band("Noche", "17:00", "07:00", 20, 1000)] }],
  };
  const intervals = [[ms("2026-10-12", "08:00"), ms("2026-10-12", "08:30")], [ms("2026-10-12", "18:00"), ms("2026-10-12", "20:00")]];
  const result = quoteUncoveredIntervals({ rate, intervals });
  assert.equal(result.valid, true, JSON.stringify(result));
  // Día: 30 × 35 = 1.050. Noche: 120 × 20 = 2.400 con tope de 1.000.
  assert.deepEqual(result.intervals.map((item) => item.amount), [1050, 1000]);
  assert.equal(result.amount, 2050);
  assert.equal(result.intervals[1].breakdown.capApplied, true);
});
