import test from "node:test";
import assert from "node:assert/strict";
import { formatChileanPlate, joinChileanPlate, normalizePlate, resolveStayQuoteAvailability, sanitizeMovementInput, splitChileTaxFromTotal, splitChileanPlate, toOperationalDateTimeParts, validateMovementInput } from "./dataEntry.mjs";

test("normaliza patentes para captura táctil", () => assert.equal(normalizePlate("ab-cd 12"), "ABCD12"));
test("valida campos operacionales obligatorios", () => {
  const errors = validateMovementInput(sanitizeMovementInput({ movementType: "entry", plate: "ABC", source: "pos" }));
  assert.deepEqual(Object.keys(errors).sort(), ["accessPoint", "parkingId", "plate"]);
});
test("acepta un ingreso completo desde POS", () => {
  const errors = validateMovementInput(sanitizeMovementInput({ movementType: "entry", plate: "AB-CD-12", parkingId: "p1", accessPoint: "Acceso 1", source: "pos" }));
  assert.deepEqual(errors, {});
});
test("compone patente chilena en dos campos", () => {
  assert.equal(joinChileanPlate("cxpy", "93"), "CXPY-93");
  assert.deepEqual(splitChileanPlate("CXPY-93"), { prefix: "CXPY", suffix: "93" });
});
test("formatea una patente chilena capturada como texto único", () => {
  assert.equal(formatChileanPlate("cxpy-93"), "CXPY-93");
  assert.equal(formatChileanPlate("abc"), "");
});
test("convierte entry_at UTC a hora operacional America/Santiago", () => {
  const result = toOperationalDateTimeParts("2026-01-15T03:30:00.000Z");
  assert.deepEqual(result, { entryDate: "15-01-2026", entryTime: "00:30" });
});
test("desglosa neto e IVA desde el precio final informado", () => assert.deepEqual(splitChileTaxFromTotal(1000), { net: 840, tax: 160, total: 1000, taxRate: 0.19 }));

// ===== Cierre Data Entry: bloqueo operacional sin tarifa válida =====
// El vehículo/ticket/permanencia deben seguir disponibles aunque no haya tarifa: por eso
// esta función nunca lanza, solo devuelve blocked=true con la permanencia ya calculada.

test("Data Entry: sin tarifa activa, la estadía queda bloqueada pero la permanencia se calcula igual", () => {
  const entryAt = new Date(Date.now() - 45 * 60 * 1000).toISOString(); // hace 45 minutos
  const result = resolveStayQuoteAvailability(null, entryAt, new Date());
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "ACTIVE_RATE_NOT_FOUND");
  assert.equal(result.elapsedMinutes, 45);
  assert.ok(Number.isFinite(result.elapsedSeconds));
});

test("Data Entry: tarifa que requiere revisión (>=24h) también bloquea el cobro sin lanzar error", () => {
  const entryAt = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // hace 25 horas
  const rate = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100, freePeriodSeconds: 0 };
  const result = resolveStayQuoteAvailability(rate, entryAt, new Date());
  assert.equal(result.blocked, true);
  assert.equal(result.reason, "RATE_REQUIRES_REVIEW");
});

test("Data Entry: con tarifa válida y estadía <24h, no queda bloqueada", () => {
  const entryAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // hace 10 minutos
  const rate = { billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100, freePeriodSeconds: 0 };
  const result = resolveStayQuoteAvailability(rate, entryAt, new Date());
  assert.equal(result.blocked, false);
  assert.equal(result.elapsedMinutes, 10);
});
