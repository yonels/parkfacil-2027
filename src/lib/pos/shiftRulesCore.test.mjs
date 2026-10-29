import test from "node:test";
import assert from "node:assert/strict";
import { findHandover, normalizeShiftRules, onDemandStartCheck, openShiftStatus, operationAllowed, programmedStartCheck, shiftWindow, validateShiftRulesInput } from "./shiftRulesCore.mjs";

// Hora de Chile en octubre 2026 = UTC-3. 15:15 local = 18:15Z.
const at = (iso) => new Date(iso);
const gloria = { id: "s-gloria", status: "OPEN", shift_date: "2026-10-29", scheduled_start: "15:00:00", scheduled_end: "15:30:00" };
const pedro = { id: "s-pedro", status: "PROGRAMMED", shift_date: "2026-10-29", scheduled_start: "15:31:00", scheduled_end: "23:00:00" };
const strict = { startWindow: "15", expiredPolicy: "BLOCK", onDemandPolicy: "NO_PROGRAMMED" };

test("valores iniciales: como hoy", () => {
  assert.deepEqual(normalizeShiftRules(null), { startWindow: "FREE", expiredPolicy: "ALLOW", onDemandPolicy: "ALWAYS" });
  assert.deepEqual(normalizeShiftRules({ shift_start_window: "30", shift_expired_policy: "WARN", shift_on_demand_policy: "NEVER" }), { startWindow: "30", expiredPolicy: "WARN", onDemandPolicy: "NEVER" });
  assert.deepEqual(Object.keys(validateShiftRulesInput({ startWindow: "45", expiredPolicy: "BLOCK", onDemandPolicy: "ALWAYS" })), ["startWindow"]);
});

test("horario programado en hora de Chile y cruce de medianoche", () => {
  const w = shiftWindow(gloria);
  assert.equal(new Date(w.startMs).toISOString(), "2026-10-29T18:00:00.000Z");
  assert.equal(new Date(w.endMs).toISOString(), "2026-10-29T18:30:00.000Z");
  const night = shiftWindow({ shift_date: "2026-10-29", scheduled_start: "22:00", scheduled_end: "06:00" });
  assert.equal(new Date(night.endMs).toISOString(), "2026-10-30T09:00:00.000Z");
});

test("regla 1: inicio de turno programado dentro del margen", () => {
  const shift = { shift_date: "2026-10-29", scheduled_start: "15:15:00", scheduled_end: "15:30:00" };
  assert.deepEqual(programmedStartCheck({ startWindow: "FREE" }, shift, at("2026-10-29T17:40:00Z")), { ok: true });
  const early = programmedStartCheck(strict, shift, at("2026-10-29T17:40:00Z"));
  assert.equal(early.code, "SHIFT_START_TOO_EARLY");
  assert.match(early.message, /Podrás iniciarlo desde las 15:00/);
  assert.equal(programmedStartCheck(strict, shift, at("2026-10-29T18:00:00Z")).ok, true);
  assert.equal(programmedStartCheck({ startWindow: "0" }, shift, at("2026-10-29T18:10:00Z")).ok, false);
  assert.equal(programmedStartCheck(strict, shift, at("2026-10-29T18:31:00Z")).code, "SHIFT_START_TOO_LATE");
});

test("regla 3: turno a pedido", () => {
  assert.equal(onDemandStartCheck({ onDemandPolicy: "ALWAYS" }, { hasProgrammedToday: true }).ok, true);
  assert.equal(onDemandStartCheck(strict, { hasProgrammedToday: false }).ok, true);
  assert.equal(onDemandStartCheck(strict, { hasProgrammedToday: true }).code, "ON_DEMAND_PROGRAMMED_EXISTS");
  assert.equal(onDemandStartCheck({ onDemandPolicy: "NEVER" }).code, "ON_DEMAND_NOT_ALLOWED");
});

test("regla 2: como hoy, el turno vencido sigue operando", () => {
  const status = openShiftStatus({ expiredPolicy: "ALLOW" }, gloria, { now: at("2026-10-29T18:40:00Z") });
  assert.equal(status.mode, "OK");
  assert.equal(operationAllowed(status, "ENTRY").ok, true);
});

test("regla 2: avisar y permitir", () => {
  const status = openShiftStatus({ expiredPolicy: "WARN" }, gloria, { now: at("2026-10-29T18:40:00Z") });
  assert.equal(status.mode, "WARN");
  assert.match(status.message, /terminó el 29-10 a las 15:30/);
  assert.equal(operationAllowed(status, "ENTRY").ok, true);
});

test("regla 2 caso B: sin turno siguiente cobra los vehículos que quedan, sin ingresos", () => {
  const status = openShiftStatus(strict, gloria, { now: at("2026-10-29T18:40:00Z"), handover: null });
  assert.equal(status.mode, "COLLECT_ONLY");
  assert.equal(operationAllowed(status, "ENTRY").code, "SHIFT_EXPIRED");
  assert.equal(operationAllowed(status, "EXIT").ok, true);
  assert.equal(operationAllowed(status, "CARD_PAYMENT_RESULT").ok, true);
});

test("regla 2 caso A: con turno siguiente ya empezado, el operador solo cierra", () => {
  const now = at("2026-10-29T18:35:00Z");
  const handover = findHandover(gloria, [gloria, pedro], now);
  assert.equal(handover.id, "s-pedro");
  const status = openShiftStatus(strict, gloria, { now, handover, handoverOperatorName: "Pedro Soto" });
  assert.equal(status.mode, "CLOSE_ONLY");
  assert.match(status.message, /Pedro Soto tiene el turno siguiente \(desde las 15:31\)/);
  assert.equal(operationAllowed(status, "EXIT").code, "SHIFT_HANDOVER");
  assert.equal(operationAllowed(status, "RELEASED_EXIT").code, "SHIFT_HANDOVER");
  assert.equal(operationAllowed(status, "CARD_PAYMENT_RESERVE").code, "SHIFT_HANDOVER");
  // Un cobro con tarjeta ya enviado a TUU siempre puede informar su resultado.
  assert.equal(operationAllowed(status, "CARD_PAYMENT_RESULT").ok, true);
});

test("relevo: el turno siguiente aún no empieza (15:30–15:31) → caso B", () => {
  assert.equal(findHandover(gloria, [pedro], at("2026-10-29T18:30:30Z")), null);
  assert.equal(findHandover(gloria, [{ ...pedro, status: "CANCELLED" }], at("2026-10-29T18:35:00Z")), null);
});

test("turno a pedido de un día anterior queda vencido (caso real 27-10)", () => {
  const onDemand = { id: "s-od", status: "OPEN", shift_date: "2026-10-27", scheduled_start: "00:00:00", scheduled_end: "23:59:00" };
  const status = openShiftStatus(strict, onDemand, { now: at("2026-10-29T18:40:00Z") });
  assert.equal(status.mode, "COLLECT_ONLY");
  assert.match(status.message, /terminó el 27-10 a las 23:59/);
  assert.equal(openShiftStatus(strict, onDemand, { now: at("2026-10-27T20:00:00Z") }).mode, "OK");
});
