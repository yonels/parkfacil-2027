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

// ---- SOL-2026-10-08-003: franjas horarias desde el formulario ----

const BAND_FORM = {
  name: "Hábil por franjas", billingMode: "EFFECTIVE_MINUTE", minuteAmount: 20, timeBandsEnabled: true,
  legalComplianceAccepted: true, validFrom: "2026-10-12T00:00:00.000Z", status: "ACTIVE",
  bandSets: [
    { label: "Todos los días", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], appliesToHolidays: false, bands: [
      { label: "Día", start: "07:00", end: "17:00", minuteAmount: "35", capAmount: "" },
      { label: "Noche", start: "17:00", end: "07:00", minuteAmount: "20", capAmount: "10000" },
    ] },
  ],
};

test("franjas: el formulario se convierte a minutos y se anula el valor por minuto general", () => {
  const input = sanitizeRateInput(BAND_FORM);
  assert.equal(input.timeBandsEnabled, true);
  assert.equal(input.minuteAmount, null);
  assert.deepEqual(input.bandSets[0].bands.map((b) => [b.startMinute, b.endMinute, b.minuteAmount, b.capAmount]), [[420, 1020, 35, null], [1020, 420, 20, 10000]]);
  assert.deepEqual(validateRateInput(input, { parkingType: "OFF_STREET" }), {});
});

test("franjas: solo Off Street; horas inválidas y cobertura incompleta se rechazan", () => {
  const input = sanitizeRateInput(BAND_FORM);
  assert.ok(validateRateInput(input, { parkingType: "ON_STREET" }).timeBands);
  const badHour = sanitizeRateInput({ ...BAND_FORM, bandSets: [{ ...BAND_FORM.bandSets[0], bands: [{ start: "25:00", end: "07:00", minuteAmount: 1 }] }] });
  assert.ok(Object.keys(validateRateInput(badHour)).length > 0);
  const gap = sanitizeRateInput({ ...BAND_FORM, bandSets: [{ ...BAND_FORM.bandSets[0], bands: [
    { start: "07:00", end: "16:00", minuteAmount: 35 }, { start: "17:00", end: "07:00", minuteAmount: 20 },
  ] }] });
  assert.match(Object.values(validateRateInput(gap)).join(" "), /sin huecos/);
});

test("franjas: tramo vencido no admite franjas", () => {
  const input = sanitizeRateInput({ ...BAND_FORM, billingMode: "EXPIRED_BLOCKS", blocks: [{ durationMinutes: 30, amount: 1000 }] });
  assert.ok(validateRateInput(input).timeBands);
});

test("tarifa clásica sin cambios: minuto efectivo conserva su valor por minuto", () => {
  const input = sanitizeRateInput({ ...BAND_FORM, timeBandsEnabled: false });
  assert.equal(input.minuteAmount, 20);
  assert.deepEqual(input.bandSets, []);
  assert.deepEqual(validateRateInput(input), {});
});
