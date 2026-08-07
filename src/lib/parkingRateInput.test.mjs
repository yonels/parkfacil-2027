import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRateInput, validateRateInput } from "./parkingRateInput.mjs";

// Estas pruebas verifican la capa API (sanitize + validate) con la misma exactitud que
// las pruebas de dominio en parkingRates.test.mjs, demostrando que Tarifas UI -> API ->
// motor usan la misma definición: ningún caso de la sección 21 puede pasar validateRateInput().

function legalMinutePayload(overrides = {}) {
  return sanitizeRateInput({
    name: "Tarifa día", billingMode: "EFFECTIVE_MINUTE", minuteAmount: "50", freePeriodMinutes: 5,
    legalComplianceAccepted: true, validFrom: "2026-08-07T08:00", status: "DRAFT", ...overrides,
  });
}
function legalBlockPayload(overrides = {}) {
  return sanitizeRateInput({
    name: "Tarifa tramo", billingMode: "EXPIRED_BLOCKS", freePeriodMinutes: 0,
    legalComplianceAccepted: true, validFrom: "2026-08-07T08:00", status: "DRAFT",
    blocks: [{ durationMinutes: 30, amount: 1000 }, { durationMinutes: 10, amount: 300, repeatAfter: true }],
    ...overrides,
  });
}

test("API acepta una tarifa de minuto efectivo legal", () => {
  assert.deepEqual(validateRateInput(legalMinutePayload()), {});
});

test("API acepta una tarifa de tramo vencido legal", () => {
  assert.deepEqual(validateRateInput(legalBlockPayload()), {});
});

test("API rechaza MINUTE + bloques (400)", () => {
  const input = legalMinutePayload();
  // sanitizeRateInput() ya descarta blocks cuando billingMode no es EXPIRED_BLOCKS;
  // forzamos el caso adversarial escribiendo directamente sobre el resultado sanitizado.
  input.blocks = [{ sequence: 1, durationSeconds: 1800, amount: 1000 }];
  const errors = validateRateInput(input);
  assert.ok(errors.blocks);
});

test("API rechaza EXPIRED_BLOCK con tramo inicial < 30 (400)", () => {
  const input = legalBlockPayload({ blocks: [{ durationMinutes: 29, amount: 1000 }, { durationMinutes: 10, amount: 300, repeatAfter: true }] });
  const errors = validateRateInput(input);
  assert.ok(errors.block_1);
});

test("API rechaza EXPIRED_BLOCK con tramo posterior < 10 (400)", () => {
  const input = legalBlockPayload({ blocks: [{ durationMinutes: 30, amount: 1000 }, { durationMinutes: 9, amount: 300, repeatAfter: true }] });
  const errors = validateRateInput(input);
  assert.ok(errors.block_2);
});

test("API rechaza modalidad desconocida (400)", () => {
  const errors = validateRateInput(legalMinutePayload({ billingMode: "FLAT_RATE" }));
  assert.ok(errors.billingMode);
});

test("API rechaza valores negativos (400)", () => {
  assert.ok(validateRateInput(legalMinutePayload({ minuteAmount: "-5" })).minuteAmount);
  const blockErrors = validateRateInput(legalBlockPayload({ blocks: [{ durationMinutes: 30, amount: -1 }, { durationMinutes: 10, amount: 300, repeatAfter: true }] }));
  assert.ok(blockErrors.block_amount_1);
});

test("API rechaza un valor nocturno fijo (redondeo/cargo ajeno a la modalidad) (400)", () => {
  const input = legalMinutePayload({ overnightFlatAmount: "5000" });
  const errors = validateRateInput(input);
  assert.ok(errors.overnightFlatAmount);
});

test("API rechaza configuración híbrida (tramo vencido con valor por minuto presente) (400)", () => {
  const input = legalBlockPayload();
  input.minuteAmount = 100; // manipulación adversarial directa, sin pasar por sanitize
  const errors = validateRateInput(input);
  assert.ok(errors.minuteAmount);
});

test("sanitize ignora los campos retirados de estadía nocturna aunque el cliente los envíe", () => {
  const input = legalMinutePayload({ regularStartTime: "08:00", regularEndTime: "22:00", overnightEndTime: "08:00" });
  assert.equal(input.regularStartTime, undefined);
  assert.equal(input.regularEndTime, undefined);
  assert.equal(input.overnightEndTime, undefined);
});

test("sanitize nunca produce bloques para minuto efectivo, aunque el cliente los envíe", () => {
  const input = legalMinutePayload({ blocks: [{ durationMinutes: 30, amount: 1000 }] });
  assert.deepEqual(input.blocks, []);
});
