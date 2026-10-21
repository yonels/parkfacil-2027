import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminModuleView, contractFromDb, COUPON_MODULE_STATUS, couponModuleRpcError, couponModuleVisible, isCouponModuleActive, moduleFromDb, resolveCouponModuleStatus } from "./couponModuleCore.mjs";
import { loadCouponModuleState } from "./couponModuleServer.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const contract = { startsAt: "2026-10-01T03:00:00Z", endsAt: "2027-10-01T03:00:00Z" };

test("status: not contracted, disabled, not started, expired and active (D3/D4)", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  assert.equal(resolveCouponModuleStatus({ module: null, contract: null, now }), COUPON_MODULE_STATUS.NOT_CONTRACTED);
  assert.equal(resolveCouponModuleStatus({ module: { enabled: false }, contract, now }), COUPON_MODULE_STATUS.DISABLED);
  assert.equal(resolveCouponModuleStatus({ module: { enabled: true }, contract: { ...contract, startsAt: "2026-11-01T03:00:00Z" }, now }), COUPON_MODULE_STATUS.NOT_STARTED);
  assert.equal(resolveCouponModuleStatus({ module: { enabled: true }, contract: { ...contract, endsAt: "2026-10-19T11:59:59Z" }, now }), COUPON_MODULE_STATUS.EXPIRED);
  assert.equal(resolveCouponModuleStatus({ module: { enabled: true }, contract, now }), COUPON_MODULE_STATUS.ACTIVE);
  assert.equal(isCouponModuleActive("ACTIVE"), true);
  assert.equal(isCouponModuleActive("DISABLED"), false);
});

test("visibility: contracted (even inactive) is visible in read-only; not contracted or unknown is hidden", () => {
  for (const status of ["ACTIVE", "DISABLED", "NOT_STARTED", "EXPIRED"]) assert.equal(couponModuleVisible(status), true, status);
  assert.equal(couponModuleVisible("NOT_CONTRACTED"), false);
  assert.equal(couponModuleVisible(undefined), false);
});

test("admin view shows status and end date only, never amounts (D8)", () => {
  const view = adminModuleView("ACTIVE", { ...contract, monthlyFeeUf: 3.5 });
  assert.deepEqual(view, { status: "ACTIVE", label: "Activo", active: true, endsAt: contract.endsAt });
  assert.equal(JSON.stringify(view).includes("3.5"), false);
  assert.deepEqual(adminModuleView(null, null), { status: "NOT_CONTRACTED", label: "No contratado", active: false, endsAt: null });
});

test("db mappers and RPC error messages", () => {
  assert.equal(contractFromDb({ id: "c", company_id: "emp", version: 2, monthly_fee_uf: "3.50", base_monthly_fee_uf: null, term_months: 24 }).monthlyFeeUf, 3.5);
  assert.deepEqual(moduleFromDb({ company_id: "emp", enabled: true, current_contract_id: "c" }), { companyId: "emp", enabled: true, currentContractId: "c", statusChangedAt: null, statusReason: "" });
  assert.deepEqual(couponModuleRpcError({ message: "COUPON_MODULE_CONTRACT_EXPIRED" }), { code: "COUPON_MODULE_CONTRACT_EXPIRED", message: "El contrato está vencido. Registra una nueva versión antes de activar.", status: 409 });
  assert.equal(couponModuleRpcError({ message: "otro" }), null);
});

function fakeDb({ moduleRow = null, contractRow = null, moduleError = null } = {}) {
  return {
    from(table) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        async maybeSingle() {
          if (table === "coupon_company_modules") return { data: moduleRow, error: moduleError };
          return { data: contractRow, error: null };
        },
      };
      return builder;
    },
  };
}

test("server state: missing storage = not contracted; active with current contract", async () => {
  const missing = await loadCouponModuleState(fakeDb({ moduleError: { code: "42P01" } }), "emp-ramis");
  assert.equal(missing.status, "NOT_CONTRACTED");
  assert.equal(missing.storageReady, false);
  const active = await loadCouponModuleState(fakeDb({ moduleRow: { company_id: "emp-ramis", enabled: true, current_contract_id: "c1" }, contractRow: { id: "c1", starts_at: contract.startsAt, ends_at: contract.endsAt } }), "emp-ramis", { now: Date.parse("2026-10-19T12:00:00Z") });
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.active, true);
  assert.equal((await loadCouponModuleState(fakeDb(), null)).status, "NOT_CONTRACTED");
});

test("migrations: catalog, per-company versioned contracts, Root-only RPC, active function and RLS", () => {
  const catalog = read("../../../supabase/migrations/20261019180000_coupon_module_catalog.sql");
  assert.match(catalog, /create table if not exists public\.coupon_module_catalog/);
  assert.match(catalog, /available_in_quotes boolean not null default false/);
  assert.match(catalog, /raw_app_meta_data->>'role'/);
  assert.match(catalog, /alter table public\.coupon_module_catalog enable row level security/);
  assert.match(catalog, /grant execute on function public\.update_coupon_module_catalog\(uuid, boolean, text\) to service_role/);
  const contracts = read("../../../supabase/migrations/20261019180100_coupon_module_contracts.sql");
  assert.match(contracts, /company_id text not null references public\.companies\(id\)/);
  assert.match(contracts, /term_months integer not null check \(term_months in \(12, 24, 36\)\)/);
  assert.match(contracts, /create unique index if not exists coupon_module_contracts_current_idx on public\.coupon_module_contracts\(company_id\) where superseded_at is null/);
  assert.match(contracts, /COUPON_MODULE_CONTRACT_IMMUTABLE/);
  assert.match(contracts, /create or replace function public\.coupon_module_active\(p_company_id text\)/);
  assert.match(contracts, /and m\.enabled\s+and c\.starts_at <= clock_timestamp\(\)\s+and c\.ends_at > clock_timestamp\(\)/);
  assert.match(contracts, /'OFF_STREET' = any\(coalesce\(v_company\.enabled_products/);
  assert.match(contracts, /insert into public\.coupon_company_modules \(company_id, enabled, current_contract_id\)\s+values \(p_company_id, false, v_next\.id\)/, "contratar no activa");
  assert.match(contracts, /COUPON_MODULE_CONTRACT_EXPIRED/);
  for (const table of ["coupon_module_contracts", "coupon_company_modules", "coupon_module_events"]) assert.match(contracts, new RegExp(`alter table public\\.${table} enable row level security`));
  const guards = read("../../../supabase/migrations/20261019180200_coupon_module_guards.sql");
  assert.match(guards, /before insert or update of delivered_at on public\.coupons/);
  assert.match(guards, /before insert on public\.coupon_merchants/);
  assert.match(guards, /COUPON_MODULE_INACTIVE/);
  assert.doesNotMatch(guards, /redeemed_at/, "el canje no se bloquea en la base (pago con tarjeta ya cobrado)");
});

test("APIs: write operations require the active module; GET reports the admin view", () => {
  const coupons = read("../../app/api/cupones/route.js");
  assert.match(coupons, /couponsActiveForCompany\(auth\.db, merchant\.company_id\)/);
  assert.match(coupons, /couponsActiveForCompany\(auth\.db, companyId\)/);
  assert.match(coupons, /module: moduleView/);
  assert.match(read("../../app/api/cupones/lote/route.js"), /couponsActiveForCompany\(auth\.db, source\.company_id\)/);
  assert.match(read("../../app/api/cupones/enviar/route.js"), /couponsActiveForCompany\(getSupabaseAdminClient\(\), coupon\.company_id\)/);
  assert.match(read("../../app/api/cupones/comercios/route.js"), /couponsActiveForCompany\(auth\.db, companyId\)/);
  const dataEntry = read("../../app/api/data-entry/route.js");
  assert.match(dataEntry, /input\.action === "EXIT" && input\.quoteSnapshot\?\.couponId\)\) && !\(await couponsActiveForParking\(current\.db, stay\.parking_id\)\)/);
  // Reserva de pago con tarjeta (TUU-02): solo en las ramas que la tienen.
  if (dataEntry.includes('if (input.action === "CARD_PAYMENT_RESERVE")')) assert.match(dataEntry, /if \(!\(await couponsActiveForParking\(current\.db, stay\.parking_id\)\)\) return fail\(COUPON_MODULE_INACTIVE_ERROR\.error/);
});

test("Root APIs and page: Root only, contract validation shared with Pago liberado, not gated by COUPONS_ENABLED", () => {
  const root = read("./couponModuleRoot.js");
  assert.match(root, /PERMISSIONS\.PLATFORM_GLOBAL/);
  assert.match(root, /actor\?\.isPlatformAdmin/);
  assert.doesNotMatch(root, /couponsEnabled/);
  const company = read("../../app/api/cupones/modulo/[companyId]/route.js");
  assert.match(company, /validateMonthlyFeeInput/);
  assert.match(company, /rpc\("coupon_module_save_contract"/);
  assert.match(read("../../app/api/cupones/modulo/[companyId]/estado/route.js"), /rpc\("coupon_module_set_state"/);
  assert.match(read("../../app/api/cupones/modulo/route.js"), /rpc\("update_coupon_module_catalog"/);
  assert.match(read("../../app/tarifas/page.js"), /href="\/tarifas\/modulos\/cupones"/);
});

test("session/proxy add the module status only for the client portal on /cupones; menu passes it to canAccessPath", () => {
  const session = read("./couponModuleSession.js");
  assert.match(session, /context\.portal !== "client"/);
  assert.match(session, /pathname === "\/cupones"/);
  assert.match(read("../../proxy.js"), /withCouponModuleStatus\(await getAuthenticatedContext\(request\), request\.nextUrl\.pathname\)/);
  assert.match(read("../../app/api/auth/session/route.js"), /couponModuleStatus: context\.couponModuleStatus/);
  assert.match(read("../../components/layout/AppShell.js"), /couponModuleStatus: context\.couponModuleStatus/);
  const client = read("../../components/cupones/CouponsClient.js");
  assert.match(client, /const readOnly = Boolean\(moduleView && !moduleView\.active\)/);
  // SOL-2026-10-20-002: en Eliminar cupones tampoco hay acciones de creación.
  assert.match(client, /actions=\{readOnly \|\| deleteMode \? \[\] :/);
});
