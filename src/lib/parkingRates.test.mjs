import test from "node:test";
import assert from "node:assert/strict";
import { calculateParkingCharge, calculateScheduledParkingCharge, classifyRateCompliance, selectActiveRate, validateOperationalRate } from "./parkingRates.mjs";

const minuteRate = (overrides = {}) => ({ billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100, freePeriodSeconds: 0, ...overrides });
const blockRate = (overrides = {}) => ({
  billingMode: "EXPIRED_BLOCKS", freePeriodSeconds: 0,
  blocks: [
    { sequence: 1, durationSeconds: 1800, amount: 1000, repeatAfter: false },
    { sequence: 2, durationSeconds: 600, amount: 300, repeatAfter: true },
  ],
  ...overrides,
});

// ===== Sección 25: Minuto efectivo =====

test("minuto: 0 minutos no cobra nada", () => {
  assert.equal(calculateParkingCharge(minuteRate(), 0).amount, 0);
});

test("minuto: 1 minuto cobra exactamente un minuto", () => {
  assert.equal(calculateParkingCharge(minuteRate(), 60).amount, 100);
});

test("minuto: varios minutos cobran proporcionalmente", () => {
  assert.equal(calculateParkingCharge(minuteRate(), 60 * 12).amount, 1200);
});

test("minuto: período gratuito se descuenta antes de cobrar", () => {
  const result = calculateParkingCharge(minuteRate({ freePeriodSeconds: 600 }), 900);
  assert.equal(result.chargeableSeconds, 300);
  assert.equal(result.amount, 500);
});

test("minuto: exactamente al final del período gratuito no cobra nada", () => {
  assert.equal(calculateParkingCharge(minuteRate({ freePeriodSeconds: 600 }), 600).amount, 0);
});

test("minuto: un segundo después del período gratuito cobra el segundo consumido", () => {
  const result = calculateParkingCharge(minuteRate({ minuteAmount: 60, freePeriodSeconds: 600 }), 601);
  assert.equal(result.chargeableSeconds, 1);
  assert.equal(result.amount, 1); // 1s * 60/60 = 1, truncado
});

test("minuto: el valor por minuto define el monto unitario", () => {
  assert.equal(calculateParkingCharge(minuteRate({ minuteAmount: 250 }), 120).amount, 500);
});

test("minuto: cero redondeos — fracciones de minuto nunca se aproximan al alza", () => {
  const rate = minuteRate({ minuteAmount: 100 });
  assert.equal(calculateParkingCharge(rate, 1).amount, 1);
  assert.equal(calculateParkingCharge(rate, 59).amount, 98);
  assert.equal(calculateParkingCharge(rate, 61).amount, 101);
});

test("minuto: no admite ningún bloque configurado", () => {
  const errors = validateOperationalRate(minuteRate({ blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000 }] }));
  assert.ok(errors.blocks);
});

// ===== Sección 26: Tramo vencido =====

test("tramo: antes de vencer el tramo inicial (29 min) no cobra nada", () => {
  const result = calculateParkingCharge(blockRate(), 29 * 60);
  assert.equal(result.amount, 0);
  assert.equal(result.unchargedSeconds, 29 * 60);
});

test("tramo: exactamente a los 30 minutos cobra el tramo inicial", () => {
  assert.equal(calculateParkingCharge(blockRate(), 30 * 60).amount, 1000);
});

test("tramo: entre 30 y 40 minutos (35) solo cobra el tramo inicial", () => {
  assert.equal(calculateParkingCharge(blockRate(), 35 * 60).amount, 1000);
});

test("tramo: exactamente a los 40 minutos cobra tramo inicial + un tramo siguiente", () => {
  assert.equal(calculateParkingCharge(blockRate(), 40 * 60).amount, 1300);
});

test("tramo: entre 40 y 50 minutos (45) NO cobra el segundo tramo siguiente todavía", () => {
  const result = calculateParkingCharge(blockRate(), 45 * 60);
  assert.equal(result.amount, 1300);
  assert.equal(result.unchargedSeconds, 5 * 60);
});

test("tramo: exactamente a los 50 minutos cobra dos tramos siguientes completos", () => {
  assert.equal(calculateParkingCharge(blockRate(), 50 * 60).amount, 1600);
});

test("tramo: períodos mayores siguen sumando solo tramos siguientes vencidos", () => {
  // 30 (inicial) + 10*6 = 90 min exactos -> inicial + 6 tramos siguientes
  const result = calculateParkingCharge(blockRate(), 90 * 60);
  assert.equal(result.amount, 1000 + 300 * 6);
  assert.equal(result.unchargedSeconds, 0);
});

test("tramo: 31 minutos NO convierte el segundo tramo en cobrable (no se anticipa un tramo no vencido)", () => {
  const result = calculateParkingCharge(blockRate(), 31 * 60);
  assert.equal(result.amount, 1000);
  assert.equal(result.unchargedSeconds, 60);
});

test("tramo: no usa Math.ceil para contar tramos — 39 minutos no alcanza el segundo tramo", () => {
  const result = calculateParkingCharge(blockRate(), 39 * 60);
  assert.equal(result.chargedBlocks.filter((seq) => seq === 2).length, 0);
});

// ===== Sección 27: configuraciones ilegales =====

test("ilegal: tramo inicial de 29 minutos", () => {
  const errors = validateOperationalRate(blockRate({ blocks: [{ sequence: 1, durationSeconds: 29 * 60, amount: 1000 }] }));
  assert.ok(errors.block_1);
});
test("ilegal: tramo inicial de 15 minutos", () => {
  const errors = validateOperationalRate(blockRate({ blocks: [{ sequence: 1, durationSeconds: 15 * 60, amount: 1000 }] }));
  assert.ok(errors.block_1);
});
test("ilegal: tramo inicial de 1 minuto", () => {
  const errors = validateOperationalRate(blockRate({ blocks: [{ sequence: 1, durationSeconds: 60, amount: 1000 }] }));
  assert.ok(errors.block_1);
});
test("ilegal: tramo siguiente de 9 minutos", () => {
  const errors = validateOperationalRate(blockRate({ blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000 }, { sequence: 2, durationSeconds: 9 * 60, amount: 200 }] }));
  assert.ok(errors.block_2);
});
test("ilegal: tramo siguiente de 5 minutos", () => {
  const errors = validateOperationalRate(blockRate({ blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000 }, { sequence: 2, durationSeconds: 5 * 60, amount: 200 }] }));
  assert.ok(errors.block_2);
});
test("ilegal: híbrido minuto efectivo + tramos", () => {
  const errors = validateOperationalRate({ billingMode: "EFFECTIVE_MINUTE", minuteAmount: 100, blocks: [{ sequence: 1, durationSeconds: 1800, amount: 1000 }] });
  assert.ok(errors.blocks);
});
test("ilegal: híbrido tramo vencido + valor por minuto", () => {
  const errors = validateOperationalRate(blockRate({ minuteAmount: 100 }));
  assert.ok(errors.minuteAmount);
});
test("ilegal: modalidad inexistente", () => {
  const errors = validateOperationalRate({ billingMode: "FLAT_RATE" });
  assert.ok(errors.billingMode);
});
test("ilegal: monto negativo en tramo", () => {
  const errors = validateOperationalRate(blockRate({ blocks: [{ sequence: 1, durationSeconds: 1800, amount: -100 }] }));
  assert.ok(errors.block_amount_1);
});
test("ilegal: valor por minuto negativo o cero", () => {
  assert.ok(validateOperationalRate(minuteRate({ minuteAmount: 0 })).minuteAmount);
  assert.ok(validateOperationalRate(minuteRate({ minuteAmount: -10 })).minuteAmount);
});
test("ilegal: período gratuito negativo", () => {
  assert.ok(validateOperationalRate(minuteRate({ freePeriodSeconds: -1 })).freePeriodSeconds);
});
test("ilegal: valor nocturno fijo (redondeo/cargo ajeno a ambas modalidades) mayor que cero", () => {
  const errors = validateOperationalRate(minuteRate({ overnightFlatAmount: 5000 }));
  assert.ok(errors.overnightFlatAmount);
});
test("legal: valor nocturno en null o cero no genera error (compatibilidad con datos heredados)", () => {
  assert.deepEqual(validateOperationalRate(minuteRate({ overnightFlatAmount: null })), {});
  assert.deepEqual(validateOperationalRate(minuteRate({ overnightFlatAmount: 0 })), {});
});

// ===== classifyRateCompliance / tarifas heredadas =====

test("classifyRateCompliance marca VALID una tarifa conforme", () => {
  assert.equal(classifyRateCompliance(minuteRate()).status, "VALID");
  assert.equal(classifyRateCompliance(blockRate()).status, "VALID");
});

test("classifyRateCompliance marca REQUIRES_REVIEW una tarifa heredada con valor nocturno", () => {
  const legacy = minuteRate({ overnightFlatAmount: 5000, regularStartTime: "08:00", regularEndTime: "22:00", overnightEndTime: "08:00" });
  const result = classifyRateCompliance(legacy);
  assert.equal(result.status, "REQUIRES_REVIEW");
  assert.ok(result.reasons.length > 0);
});

test("selectActiveRate nunca selecciona una tarifa REQUIRES_REVIEW aunque su status sea ACTIVE", () => {
  const now = Date.now();
  const legacy = { id: "legacy", status: "ACTIVE", validFrom: new Date(now - 10000).toISOString(), validUntil: null, ...minuteRate({ overnightFlatAmount: 5000 }) };
  assert.equal(selectActiveRate([legacy], now), null);
});

test("selectActiveRate elige la tarifa activa vigente y conforme (misma lógica que usa Data Entry)", () => {
  const now = new Date("2026-08-07T12:00:00-04:00").getTime();
  const vigente = { id: "r1", status: "ACTIVE", validFrom: "2026-08-01T00:00:00-04:00", validUntil: null, ...minuteRate() };
  assert.equal(selectActiveRate([vigente], now)?.id, "r1");
});

test("selectActiveRate ignora tarifas en borrador, vencidas o que aun no empiezan", () => {
  const now = new Date("2026-08-07T12:00:00-04:00").getTime();
  const borrador = { id: "r1", status: "DRAFT", validFrom: "2026-08-01T00:00:00-04:00", validUntil: null, ...minuteRate() };
  const vencida = { id: "r2", status: "ACTIVE", validFrom: "2026-01-01T00:00:00-04:00", validUntil: "2026-02-01T00:00:00-04:00", ...minuteRate() };
  const futura = { id: "r3", status: "ACTIVE", validFrom: "2026-12-01T00:00:00-04:00", validUntil: null, ...minuteRate() };
  assert.equal(selectActiveRate([borrador, vencida, futura], now), null);
});

test("selectActiveRate no encuentra nada en una lista vacia", () => {
  assert.equal(selectActiveRate([], Date.now()), null);
  assert.equal(selectActiveRate(undefined, Date.now()), null);
});

// ===== calculateScheduledParkingCharge: único cálculo por timestamps =====

test("calculateScheduledParkingCharge usa el mismo motor central sobre el tiempo total transcurrido", () => {
  const result = calculateScheduledParkingCharge(minuteRate({ minuteAmount: 60 }), "2026-08-02T21:00:00-04:00", "2026-08-02T23:00:00-04:00");
  assert.equal(result.elapsedSeconds, 2 * 3600);
  assert.equal(result.amount, 60 * 120);
});

test("calculateScheduledParkingCharge exige que la salida sea posterior al ingreso", () => {
  const result = calculateScheduledParkingCharge(minuteRate(), "2026-08-02T21:00:00-04:00", "2026-08-02T20:00:00-04:00");
  assert.equal(result.valid, false);
});

test("plazas multiplican tarifa solo cuando la política lo indica", () => {
  const base = minuteRate({ minuteAmount: 100 });
  assert.equal(calculateParkingCharge(base, 60, 3).amount, 100);
  assert.equal(calculateParkingCharge({ ...base, multiplyBySpaces: true }, 60, 3).amount, 300);
});
