import assert from "node:assert/strict";
import test from "node:test";
import { formatInspectorDuration, overdueInspectorSeconds, relativeTimeFromNow, remainingInspectorSeconds } from "./inspectorTime.mjs";

test("relativeTimeFromNow formatea en minutos/horas/días, igual al ejemplo del enunciado", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  assert.equal(relativeTimeFromNow("2026-08-27T11:59:30Z", now), "Hace instantes");
  assert.equal(relativeTimeFromNow("2026-08-27T11:52:00Z", now), "Hace 8 min");
  assert.equal(relativeTimeFromNow("2026-08-27T09:00:00Z", now), "Hace 3 h");
  assert.equal(relativeTimeFromNow("2026-08-24T12:00:00Z", now), "Hace 3 d");
});

test("relativeTimeFromNow nunca muestra tiempo negativo ni relojes futuros como pasado inválido", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  assert.equal(relativeTimeFromNow("2026-08-27T12:05:00Z", now), "Hace instantes");
  assert.equal(relativeTimeFromNow("fecha-invalida", now), "—");
});

test("remainingInspectorSeconds nunca es negativo tras el vencimiento (VIGENTE nunca muestra tiempo negativo)", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  assert.equal(remainingInspectorSeconds("2026-08-27T12:17:00Z", now), 17 * 60);
  assert.equal(remainingInspectorSeconds("2026-08-27T11:00:00Z", now), 0);
});

test("overdueInspectorSeconds calcula cuánto tiempo lleva vencida una sesión VENCIDO", () => {
  const now = Date.parse("2026-08-27T12:00:00Z");
  assert.equal(overdueInspectorSeconds("2026-08-27T11:45:00Z", now), 15 * 60);
  assert.equal(overdueInspectorSeconds("2026-08-27T12:05:00Z", now), 0, "una sesión que aún no vence no está 'vencida'");
});

test("formatInspectorDuration usa h/min/s legibles, sin negativos", () => {
  assert.equal(formatInspectorDuration(45), "45 s");
  assert.equal(formatInspectorDuration(17 * 60), "17 min");
  assert.equal(formatInspectorDuration(95 * 60), "1 h 35 min");
  assert.equal(formatInspectorDuration(-10), "0 s");
});
