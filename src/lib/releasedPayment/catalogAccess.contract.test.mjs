import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Pago liberado (Fase A): el catálogo es exclusivo de Root en navegación,
// API y base. El cliente, operador y supervisor no lo ven ni lo modifican.
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const route = read("../../app/api/planes/modulos/pago-liberado/route.js");
const page = read("../../app/tarifas/modulos/pago-liberado/page.js");
const plans = read("../../app/tarifas/page.js");
const migration = read("../../../supabase/migrations/20261001090000_released_payment_catalog.sql");
const migracionPrecioAbierto = read("../../../supabase/migrations/20261002090000_released_payment_open_price.sql");

test("precio abierto: la RPC sigue siendo solo Root, atómica, auditada y solo para service_role; sin precios", () => {
  assert.match(migracionPrecioAbierto, /if actor_role is distinct from 'platform_admin' then\s*raise exception 'RELEASED_PAYMENT_FORBIDDEN'/);
  assert.ok(migracionPrecioAbierto.includes("insert into public.released_payment_catalog_audit"));
  assert.ok(migracionPrecioAbierto.includes("revoke all on function public.update_released_payment_catalog(uuid, jsonb) from public, anon, authenticated;"));
  assert.ok(migracionPrecioAbierto.includes("grant execute on function public.update_released_payment_catalog(uuid, jsonb) to service_role;"));
  const rpc = migracionPrecioAbierto.slice(migracionPrecioAbierto.indexOf("create or replace function"));
  assert.doesNotMatch(rpc, /price|precio|spots|cupo/i, "la RPC no maneja precios ni cupos");
});

test("API: GET y PATCH exigen Root (platform_admin); nunca un permiso de empresa", () => {
  assert.match(route, /authorizeRemainingRequest\(request, PERMISSIONS\.PLATFORM_GLOBAL\)/);
  assert.match(route, /if \(!actor\.isPlatformAdmin\) return \{ response: forbidden\(\) \};/);
  assert.equal((route.match(/await authorizeRoot\(request\)/g) || []).length, 2, "GET y PATCH pasan por authorizeRoot");
  assert.doesNotMatch(route, /COMPANY_READ|COMPANY_WRITE/);
});

test("API: valida en el servidor y guarda vía RPC atómica (re-verifica Root en la base)", () => {
  assert.match(route, /const \{ rows, errors \} = sanitizeCatalogInput\(/);
  assert.match(route, /rpc\("update_released_payment_catalog", \{ p_actor_id: actor\.id, p_items: rows \}\)/);
  assert.match(migration, /if actor_role is distinct from 'platform_admin' then\s*raise exception 'RELEASED_PAYMENT_FORBIDDEN'/);
  assert.match(migration, /revoke all on function public\.update_released_payment_catalog\(uuid, jsonb\) from public, anon, authenticated;/);
  assert.match(migration, /insert into public\.released_payment_catalog_audit/);
});

test("base: service_role solo LEE el catálogo y su auditoría; nunca escribe directo", () => {
  assert.match(migration, /grant select on public\.released_payment_catalog to service_role;/);
  assert.match(migration, /grant select on public\.released_payment_catalog_audit to service_role;/);
  assert.doesNotMatch(migration, /grant\s+[a-z, ]*\b(insert|update|delete)\b[a-z, ]*\bon\s+(table\s+)?public\.released_payment_catalog/i);
});

test("UI: no muestra precios hasta que la API confirma Root; ubicación Planes → Módulos adicionales", () => {
  assert.match(page, /const \[form, setForm\] = useState\(null\);/);
  assert.doesNotMatch(page, /DEFAULT_RELEASED_PAYMENT_CATALOG/);
  assert.ok(route.includes("return NextResponse.json({ data: [], audit: [], storageReady: false"), "sin migración no se muestran precios fijos");
  assert.ok(page.includes("{form?.length ? ("), "sin filas no se dibuja la tabla de precios");
  assert.match(plans, /\{isRoot \? \(\s*<section[\s\S]{0,200}Módulos adicionales/);
  assert.match(plans, /setIsRoot\(Boolean\(body\.permissions\?\.canCreate\)\)/);
  assert.match(plans, /href="\/tarifas\/modulos\/pago-liberado"/);
});
