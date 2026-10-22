// Base efímera: requiere PGLITE_DIST apuntando a dist/ de @electric-sql/pglite@0.5.11.
// No usa .env ni conexiones remotas. Esquema mínimo; no sustituye QA de Supabase/RLS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { signWebpayQuoteEvidence } from '../src/lib/webpayQuoteEvidence.mjs';
const dist = process.env.PGLITE_DIST;
if (!dist) throw new Error('Configura PGLITE_DIST para ejecutar estas pruebas locales.');
const { PGlite } = await import(pathToFileURL(resolve(dist, 'index.js')).href);
const { pgcrypto } = await import(pathToFileURL(resolve(dist, 'contrib/pgcrypto.js')).href);
const db = new PGlite({ extensions: { pgcrypto } });
const rateId = '11111111-1111-4111-8111-111111111111';
const stayId = '22222222-2222-4222-8222-222222222222';
const parkingId = '33333333-3333-4333-8333-333333333333';
const secret = 'LOCAL_TEST_SECRET_NOT_A_REAL_CREDENTIAL_123456';
const stamp = '2026-10-20T12:00:00.000Z';
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema extensions; create extension pgcrypto with schema extensions;
    create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text);
    create table public.parking_rates (
      id uuid primary key, parking_id uuid, name text, status text, billing_mode text,
      minute_amount numeric, free_period_seconds integer default 0, multiply_by_spaces boolean default false,
      regular_start_time time, regular_end_time time, overnight_flat_amount numeric,
      valid_from timestamptz, valid_until timestamptz, updated_at timestamptz, created_at timestamptz default now(), notes text,
      constraint parking_rates_overnight_flat_amount_check check(overnight_flat_amount is null or overnight_flat_amount=0));
    create table public.parking_stays (
      id uuid primary key, parking_id uuid, entry_at timestamptz, status text default 'OPEN', updated_at timestamptz,
      rate_id uuid references public.parking_rates(id), rate_name text, billing_mode text,
      exit_at timestamptz, elapsed_minutes integer, subtotal_amount integer, discount_amount integer,
      coupon_id uuid, coupon_code text, net_amount integer, tax_amount integer, total_amount integer,
      payment_method text, payment_code text);
    create table public.parking_rate_blocks(id uuid,rate_id uuid,sequence integer,duration_seconds integer,amount numeric,repeat_after boolean);
  `);
  await db.query('insert into vault.decrypted_secrets values ($1,$2)', ['webpay_quote_hmac_secret', secret]);
  await db.exec(await readFile(new URL('../supabase/migrations/20260813100000_webpay_stay_accreditation.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261021134536_closing_debt_once.sql', import.meta.url), 'utf8'));
  await db.query(`insert into parking_rates(id,parking_id,name,status,billing_mode,minute_amount,
    regular_start_time,regular_end_time,overnight_flat_amount,closing_debt_enabled,valid_from,updated_at)
    values($1,$2,'Plan prueba','ACTIVE','EFFECTIVE_MINUTE',50,'08:00','20:00',5000,true,'2026-01-01',$3)`, [rateId, parkingId, stamp]);
  await db.query(`insert into parking_stays(id,parking_id,entry_at,updated_at) values($1,$2,'2026-10-20T15:00:00-03:00',$3)`, [stayId, parkingId, stamp]);
});
after(async () => { await db.close(); });

test('SQL asigna plan original automáticamente al ingreso', async () => {
  const {rows} = await db.query('select rate_id,rate_name from parking_stays where id=$1', [stayId]);
  assert.equal(rows[0].rate_id, rateId);
  assert.equal(rows[0].rate_name, 'Plan prueba');
});
test('SQL impide alterar importe, horario o plan de deuda existente', async () => {
  await assert.rejects(db.query("update parking_rates set status='DRAFT' where id=$1", [rateId]), /CLOSING_RATE_IMMUTABLE/);
  await assert.rejects(db.query('update parking_rates set minute_amount=99 where id=$1', [rateId]), /CLOSING_RATE_IMMUTABLE/);
  await assert.rejects(db.query("update parking_rates set regular_end_time='23:00' where id=$1", [rateId]), /CLOSING_RATE_IMMUTABLE/);
  await assert.rejects(db.query('update parking_stays set rate_id=null where id=$1', [stayId]), /CLOSING_TICKET_IMMUTABLE/);
  await assert.rejects(db.query("update parking_stays set entry_at=entry_at+interval '1 hour' where id=$1", [stayId]), /CLOSING_TICKET_IMMUTABLE/);
});
test('SQL rechaza nocturna sin activación explícita y horario inválido', async () => {
  await assert.rejects(db.exec("insert into parking_rates(id,overnight_flat_amount) values(gen_random_uuid(),5000)"), /parking_rates_overnight_flat_amount_check/);
  await assert.rejects(db.exec("insert into parking_rates(id,closing_debt_enabled,billing_mode,regular_start_time,regular_end_time,overnight_flat_amount) values(gen_random_uuid(),true,'EFFECTIVE_MINUTE','08:00','08:00',5000)"), /parking_rates_overnight_flat_amount_check/);
});
async function quote(evidenceOverride) {
  const calculatedAt = new Date();
  const elapsedMinutes = Math.floor((calculatedAt - new Date('2026-10-20T18:00:00Z')) / 60000);
  const values = { stayId, stayUpdatedAt: stamp, calculatedAt, rateId, rateUpdatedAt: stamp,
    rateBlocksSnapshot: [], elapsedMinutes, rateName: 'Plan prueba', billingMode: 'EFFECTIVE_MINUTE',
    subtotalAmount: 20000, discountAmount: 0, netAmount: 16807, taxAmount: 3193, totalAmount: 20000 };
  const signature = evidenceOverride || signWebpayQuoteEvidence(values, secret);
  return db.query(`select create_webpay_stay_quote($1,$2,$3,$4,$5,'[]',$6,$7,$8,20000,0,16807,3193,20000,$9) as id`,
    [stayId,stamp,calculatedAt.toISOString(),rateId,stamp,elapsedMinutes,'Plan prueba','EFFECTIVE_MINUTE',signature]);
}
test('Webpay acepta deuda firmada aunque plan terminó y rechaza firma inválida', async () => {
  await db.query("update parking_rates set status='ENDED',valid_until='2026-10-21T00:00:00Z' where id=$1", [rateId]);
  const result = await quote();
  assert.ok(result.rows[0].id);
  await assert.rejects(quote('0'.repeat(64)), /INVALID_QUOTE_EVIDENCE/);
});
test('Webpay cancela deuda una sola vez; pagado deja de admitir nuevo cálculo', async () => {
  const {rows} = await quote();
  const id = rows[0].id;
  const pay = () => db.query('select accredit_webpay_parking_stay($1,$2,$3,20000)', [stayId,id,'TEST-PAYMENT']);
  await pay();
  await pay();
  const result = await db.query('select status,total_amount from parking_stays where id=$1', [stayId]);
  assert.equal(result.rows[0].status, 'PAID');
  assert.equal(result.rows[0].total_amount, 20000);
  await assert.rejects(quote(), /INVALID_STATE/);
});
test('migración conserva ejecución Webpay exclusiva de service_role', async () => {
  const {rows} = await db.query(`select has_function_privilege('anon',oid,'EXECUTE') as anon,
    has_function_privilege('authenticated',oid,'EXECUTE') as authenticated,
    has_function_privilege('service_role',oid,'EXECUTE') as service
    from pg_proc where proname='create_webpay_stay_quote'`);
  assert.deepEqual(rows[0], {anon:false,authenticated:false,service:true});
});
