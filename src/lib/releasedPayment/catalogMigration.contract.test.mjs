import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Pago liberado (SOL-2026-10-16-002, opción A): migración consolidada solo de
// catálogo. Publica la fila MONTHLY_FEE apagada, sin precios, solo Root.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("../../../supabase/migrations/20261016170000_released_payment_catalog_monthly_fee.sql");
const rpc = migration.slice(migration.indexOf("create or replace function"));

test("catálogo: solo la fila MONTHLY_FEE, apagada y sin precios", () => {
  assert.match(migration, /values \('MONTHLY_FEE', null, 'MONTH', 1, false, ''\)\s*on conflict \(modality\) do nothing;/);
  assert.equal((migration.match(/insert into public\.released_payment_catalog \(/g) || []).length, 1, "no siembra otras modalidades");
  assert.match(migration, /drop column if exists package_price_uf/);
  const createTable = migration.slice(migration.indexOf("create table if not exists public.released_payment_catalog ("), migration.indexOf("create table if not exists public.released_payment_catalog_audit"));
  assert.doesNotMatch(createTable, /price|spots/i, "la tabla nueva no tiene precios ni cupos");
});

test("alcance: no crea objetos de fases B–E ni toca estadías/POS", () => {
  assert.doesNotMatch(migration, /released_payment_(contracts|parking_modules|authorizations|module_events|tariffs)/);
  assert.doesNotMatch(migration, /parking_stays|parkings\b/);
});

test("acceso: RLS sin políticas, anon/authenticated sin privilegios, service_role solo lee", () => {
  assert.match(migration, /alter table public\.released_payment_catalog enable row level security;/);
  assert.match(migration, /alter table public\.released_payment_catalog_audit enable row level security;/);
  assert.match(migration, /revoke all on public\.released_payment_catalog from anon, authenticated, service_role;/);
  assert.match(migration, /revoke all on public\.released_payment_catalog_audit from anon, authenticated, service_role;/);
  assert.match(migration, /grant select on public\.released_payment_catalog to service_role;/);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete|all)/i);
});

test("RPC: solo Root, atómica, auditada y ejecutable solo por service_role; sin precios", () => {
  assert.match(rpc, /if actor_role is distinct from 'platform_admin' then\s*raise exception 'RELEASED_PAYMENT_FORBIDDEN'/);
  assert.match(rpc, /insert into public\.released_payment_catalog_audit/);
  assert.match(rpc, /security definer\s*set search_path = public, auth/);
  assert.ok(migration.includes("revoke all on function public.update_released_payment_catalog(uuid, jsonb) from public, anon, authenticated;"));
  assert.ok(migration.includes("grant execute on function public.update_released_payment_catalog(uuid, jsonb) to service_role;"));
  assert.doesNotMatch(rpc, /price|precio|spots|cupo/i);
});
