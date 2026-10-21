import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScheduledParkingCharge, selectStayRate } from './parkingRates.mjs';
import { resolveStayQuoteAvailability } from './dataEntry.mjs';
import { sanitizeRateInput, validateRateInput } from './parkingRateInput.mjs';
import { quoteParkingStay, toPagueAquiQuote } from './parkingStayQuoteService.js';

const plan = { id: 'original', parkingId: 'parking', name: 'Plan prueba', status: 'ACTIVE', validFrom: '2026-01-01T00:00:00Z', validUntil: null,
  billingMode: 'EFFECTIVE_MINUTE', minuteAmount: 50, freePeriodSeconds: 0, blocks: [],
  closingDebtEnabled: true, regularStartTime: '08:00', regularEndTime: '20:00', overnightFlatAmount: 5000 };
const entry = '2026-10-21T15:00:00-03:00';
const calc = (exit, rate = plan, start = entry) => calculateScheduledParkingCharge(rate, start, exit);

test('antes del cierre cobra solamente minutos completos', () => {
  const q = calc('2026-10-21T19:59:59-03:00');
  assert.equal(q.amount, 299 * 50);
  assert.equal(q.overnightAmount, 0);
  assert.equal(q.frozen, false);
});
test('15:00 a 20:00: 300 minutos más una noche; congela al cierre exacto', () => {
  const q = calc('2026-10-21T20:00:00-03:00');
  assert.equal(q.chargedMinutes, 300);
  assert.equal(q.daytimeAmount, 15000);
  assert.equal(q.overnightAmount, 5000);
  assert.equal(q.amount, 20000);
  assert.equal(q.frozenAt, '2026-10-21T23:00:00.000Z');
});
test('mañana, 70 días y años después: importe idéntico y deuda pagable', () => {
  for (const at of ['2026-10-22T22:00:00Z', '2026-12-30T22:00:00Z', '2030-01-01T00:00:00Z']) {
    const q = resolveStayQuoteAvailability(plan, entry, new Date(at));
    assert.equal(q.blocked, false);
    assert.equal(q.charge.amount, 20000);
    assert.equal(q.charge.chargedMinutes, 300);
  }
});
test('no cobra segunda noche ni monto diario configurado', () => {
  assert.equal(calc('2027-01-01', { ...plan, dailyFlatAmount: 999999 }).amount, 20000);
});
test('descuenta período gratuito una sola vez, sin descontar tarifa nocturna', () => {
  const q = calc('2027-01-01', { ...plan, freePeriodSeconds: 600 });
  assert.equal(q.amount, 290 * 50 + 5000);
});
test('admite nocturna explícita de cero, no inventa un valor', () => {
  assert.equal(calc('2027-01-01', { ...plan, overnightFlatAmount: 0 }).amount, 15000);
  assert.equal(calc('2027-01-01', { ...plan, overnightFlatAmount: null }).valid, false);
});
test('cierre tras medianoche y entrada en madrugada usan la misma jornada', () => {
  const night = { ...plan, regularStartTime: '18:00', regularEndTime: '02:00' };
  assert.equal(calc('2027-01-01', night, '2026-10-21T23:00:00-03:00').amount, 180 * 50 + 5000);
  assert.equal(calc('2027-01-01', night, '2026-10-22T01:00:00-03:00').amount, 60 * 50 + 5000);
});
test('cierre a medianoche conserva fecha correcta', () => {
  assert.equal(calc('2027-01-01', { ...plan, regularEndTime: '00:00' }).amount, 540 * 50 + 5000);
});
test('horario de invierno usa Chile UTC-4', () => {
  const q = calc('2026-07-22', plan, '2026-07-21T15:00:00-04:00');
  assert.equal(q.amount, 20000);
  assert.equal(q.frozenAt, '2026-07-22T00:00:00.000Z');
});
test('cambio horario de primavera cobra minutos reales hasta cierre', () => {
  const night = { ...plan, regularStartTime: '18:00', regularEndTime: '02:00' };
  const q = calc('2026-09-08', night, '2026-09-05T23:00:00-04:00');
  assert.equal(q.chargedMinutes, 120);
  assert.equal(q.amount, 11000);
});
test('ingreso fuera de apertura, fecha inválida o configuración incompleta no produce deuda', () => {
  assert.equal(calc('2027-01-01', plan, '2026-10-21T21:00:00-03:00').valid, false);
  assert.equal(calc('2027-01-01', plan, 'incorrecta').valid, false);
  assert.equal(calc('2027-01-01', { ...plan, regularEndTime: null }).valid, false);
});
test('API conserva y valida la configuración explícita; rechaza montos inválidos', () => {
  const input = sanitizeRateInput({ ...plan, legalComplianceAccepted: true });
  assert.deepEqual(validateRateInput(input), {});
  assert.equal(input.regularEndTime, '20:00');
  for (const amount of [-1, 1.5, NaN, Infinity]) {
    assert.ok(validateRateInput({ ...input, overnightFlatAmount: amount }).overnightFlatAmount);
  }
  assert.ok(validateRateInput({ ...input, regularEndTime: '08:00' }).regularEndTime);
});
test('reemplazar o finalizar plan no cambia tarifa asignada ni importe', () => {
  const ended = { ...plan, status: 'ENDED', validUntil: '2026-10-22T00:00:00Z' };
  const newer = { ...plan, id: 'new', minuteAmount: 999, validFrom: '2026-10-22T00:00:00Z' };
  const selected = selectStayRate([newer, ended], { rate_id: plan.id, entry_at: entry }, new Date('2027-01-01'));
  assert.equal(selected.id, plan.id);
  assert.equal(calc('2027-01-01', selected).amount, 20000);
});
test('ticket antiguo sin referencia: solo plan histórico inequívoco, nunca plan posterior', () => {
  const stay = { entry_at: entry };
  assert.equal(selectStayRate([plan], stay).id, plan.id);
  assert.equal(selectStayRate([{ ...plan, validFrom: '2026-11-01' }], stay), null);
  assert.equal(selectStayRate([plan, { ...plan, id: 'ambiguous' }], stay), null);
});
test('servicio y respuesta pública mantienen el total fijo con plan finalizado (DB simulada)', async () => {
  const row = { id: plan.id, parking_id: 'parking', name: plan.name, status: 'ENDED', valid_from: plan.validFrom,
    valid_until: '2026-10-22T00:00:00Z', billing_mode: plan.billingMode, minute_amount: 50,
    closing_debt_enabled: true, regular_start_time: '08:00:00', regular_end_time: '20:00:00', overnight_flat_amount: 5000 };
  const db = { from(table) {
    const data = { parking_rates: [row], parking_stays: [{rate_id: plan.id}], parking_rate_blocks: [], parkings: {company_id: 'company'} }[table];
    const query = { then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); } };
    for (const method of ['select', 'eq', 'in', 'not', 'order', 'maybeSingle']) query[method] = () => query;
    return query;
  } };
  const stay = { id: 'ticket', parking_id: 'parking', rate_id: plan.id, entry_at: entry };
  for (const now of [new Date('2026-10-23'), new Date('2027-01-01')]) {
    const quote = await quoteParkingStay(db, stay, { now });
    const publicQuote = toPagueAquiQuote({ stay, quote, calculatedAt: now });
    assert.equal(publicQuote.payable, true);
    assert.equal(publicQuote.amount, 20000);
    assert.equal(publicQuote.billableMinutes, 300);
    assert.equal(publicQuote.overnightAmount, 5000);
  }
});
