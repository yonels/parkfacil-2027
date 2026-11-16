// Diagnosticos de Etapa 1: caracterizan el codigo existente, NO lo corrigen.
// Sin Supabase, red, credenciales ni datos productivos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOccupancy, buildDailyMovementsSeries, validateDashboardFilters } from '../../../src/lib/offStreetDashboardCore.mjs';
import { buildDailyRevenueSeries, summarizeRevenueRows } from '../../../src/lib/offStreetRevenueCore.mjs';
import { resolveQueryParkingIds, getRevenueOverview } from '../../../src/lib/offStreetRevenueService.js';
import { getOffStreetDashboardOverview } from '../../../src/lib/offStreetDashboardService.js';
import { resolvePeriodBounds } from '../../../src/lib/onStreetDashboardCore.mjs';

const parks = ['a', 'b'].map(id => ({ id, code: id.toUpperCase(), type: 'OFF_STREET', companyId: 'qa-company' }));
function emptyRecordingDb() {
  const calls = [];
  return { calls, from(table) {
    let columns;
    const api = {
      select(value) { columns = value; return api; },
      in(field, ids) { calls.push({ table, columns, field, ids }); return api; },
      eq() { return api; }, gte() { return api; }, lte() { return api; },
      or() { return api; }, order() { return api; },
      async range() { return { data: [], error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject); },
    };
    return api;
  } };
}
test('capacidad desconocida no se convierte en 0%; sobreocupacion no se oculta', () => {
  assert.equal(computeOccupancy({ capacity: 0, insideCount: 5 }).occupancyPercentage, null);
  assert.equal(computeOccupancy({ capacity: 10, insideCount: 12 }).occupancyPercentage, 120);
});
test('ticket promedio canonico divide por pagos, incluido pago de monto cero', () => {
  assert.deepEqual(summarizeRevenueRows([{ total_amount: 100, payment_method: 'CASH' }, { total_amount: 0, payment_method: 'CARD' }]), {
    totalAmount: 100, cashAmount: 100, cardAmount: 0, count: 2, averageTicket: 50,
  });
});
test('SR-01: se observa truncamiento de series a 400 dias; NO es aceptacion de Total', () => {
  assert.equal(buildDailyMovementsSeries([], '2024-01-01', '2025-12-31').length, 400);
  assert.equal(buildDailyRevenueSeries([], '2024-01-01', '2025-12-31').length, 400);
});
test('SR-02: validacion actual admite fecha imposible; corregir antes de M3', () => {
  assert.equal(validateDashboardFilters({ dateFrom: '2026-02-30', dateTo: '2026-03-01' }).ok, true);
});
test('SR-03: limite On Street de octubre usa -04 y cae a la 01:00 local; falta DST', () => {
  const range = resolvePeriodBounds('month', { month: 10, year: 2026 });
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hourCycle: 'h23' }).format(new Date(range.from));
  assert.equal(hour, '01');
});
test('SR-04: resolvedor mantiene dos candidatos aunque queryParkingIds pide solo uno', () => {
  const result = resolveQueryParkingIds(parks, { parkingId: 'a' });
  assert.deepEqual(result.queryParkingIds, ['a']);
  assert.equal(result.candidateParkings.length, 2);
});
test('SR-04: dashboard seleccionado a envia a,b al resumen operativo/financiero', async () => {
  const db = emptyRecordingDb();
  await getOffStreetDashboardOverview(db, parks, { parkingId: 'a', dateFrom: '2026-10-01', dateTo: '2026-10-01', now: new Date('2026-10-01T15:00:00Z') });
  assert.ok(db.calls.some(call => call.table === 'parking_stays' && call.columns === 'id' && call.ids.includes('b')));
  assert.ok(db.calls.some(call => call.table === 'parking_stays' && call.columns.includes('payment_method') && call.ids.includes('b')));
});
test('SR-05: resumen financiero por a aun consulta diferencias de caja de a,b', async () => {
  const db = emptyRecordingDb();
  await getRevenueOverview(db, parks, { parkingId: 'a', dateFrom: '2026-10-01', dateTo: '2026-10-01' });
  assert.ok(db.calls.some(call => call.table === 'shift_closures' && call.columns === 'cash_difference' && call.ids.includes('b')));
});
