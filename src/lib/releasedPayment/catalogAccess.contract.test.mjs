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

test("UI: no muestra precios hasta que la API confirma Root; ubicación Planes → Módulos adicionales", () => {
  assert.match(page, /const \[form, setForm\] = useState\(null\);/);
  assert.doesNotMatch(page, /DEFAULT_RELEASED_PAYMENT_CATALOG/);
  assert.match(plans, /\{isRoot \? \(\s*<section[\s\S]{0,200}Módulos adicionales/);
  assert.match(plans, /setIsRoot\(Boolean\(body\.permissions\?\.canCreate\)\)/);
  assert.match(plans, /href="\/tarifas\/modulos\/pago-liberado"/);
});
