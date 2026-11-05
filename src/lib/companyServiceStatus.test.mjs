import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAuthenticatedContext } from "./auth/contextCore.mjs";
import { canManageCompanyStatus, companyStatusFromEditForm, isParkingCompanyActive, isSessionCompanyActive, isStayCompanyActive, validateCompanyStatusChange } from "./companyServiceStatus.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function mockDb(tables) {
  return { from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tables[table] ?? null, error: null }) }) }) }) };
}

test("solo se gestiona el estado de clientes activos o inactivos", () => {
  assert.equal(canManageCompanyStatus({ tipoRelacion: "client", estado: "active" }), true);
  assert.equal(canManageCompanyStatus({ tipoRelacion: "client", estado: "inactive" }), true);
  assert.equal(canManageCompanyStatus({ tipoRelacion: "client", estado: "onboarding" }), false);
  assert.equal(canManageCompanyStatus({ tipoRelacion: "administrator", estado: "active" }), false);
  assert.equal(canManageCompanyStatus({ tipoRelacion: "operator", estado: "active" }), false);
});

test("desactivar exige motivo, y «Otro motivo» exige detalle", () => {
  assert.match(validateCompanyStatusChange({ status: "inactive" }).error, /motivo/);
  assert.match(validateCompanyStatusChange({ status: "inactive", reasonCode: "INVENTADO" }).error, /motivo/);
  assert.match(validateCompanyStatusChange({ status: "inactive", reasonCode: "OTHER", detail: " " }).error, /motivo/);
  assert.deepEqual(validateCompanyStatusChange({ status: "inactive", reasonCode: "UNPAID_INVOICES" }), { status: "inactive", reasonCode: "UNPAID_INVOICES", reasonDetail: "" });
});

test("reactivar exige explicación y no acepta otro motivo", () => {
  assert.match(validateCompanyStatusChange({ status: "active" }).error, /reactiva/);
  assert.deepEqual(validateCompanyStatusChange({ status: "active", reasonCode: "OTHER", detail: "Pagó las facturas" }), { status: "active", reasonCode: "REACTIVATION", reasonDetail: "Pagó las facturas" });
  assert.match(validateCompanyStatusChange({ status: "onboarding" }).error, /no es válido/);
});

test("el formulario de edición no activa ni desactiva", () => {
  assert.equal(companyStatusFromEditForm("active", "inactive"), "active");
  assert.equal(companyStatusFromEditForm("inactive", "active"), "inactive");
  assert.equal(companyStatusFromEditForm("onboarding", "inactive"), "onboarding");
  assert.equal(companyStatusFromEditForm("onboarding", "active"), "active");
  assert.equal(companyStatusFromEditForm("active", "onboarding"), "onboarding");
});

test("los servicios públicos se apagan solo con una desactivación explícita", async () => {
  assert.equal(await isParkingCompanyActive(mockDb({ parkings: { company: { status: "inactive" } } }), "p"), false);
  assert.equal(await isParkingCompanyActive(mockDb({ parkings: { company: { status: "active" } } }), "p"), true);
  assert.equal(await isParkingCompanyActive(mockDb({ parkings: { company: { status: "onboarding" } } }), "p"), true);
  assert.equal(await isStayCompanyActive(mockDb({ parking_stays: { parking_id: "p" }, parkings: { company: { status: "inactive" } } }), "s"), false);
  assert.equal(await isStayCompanyActive(mockDb({}), "s"), true);
  assert.equal(await isSessionCompanyActive(mockDb({ on_street_pilot_sessions: { parking_id: "p" }, parkings: { company: { status: "inactive" } } }), "s"), false);
});

test("administrador y operador de una empresa desactivada reciben un mensaje claro", async () => {
  const membership = (role) => ({ user_id: "u", company_id: "c", role, status: "active", pos_only: false, company: { id: "c", status: "inactive", relationship_type: "client", enabled_products: ["OFF_STREET"] } });
  for (const [role, portal] of [["company_admin", "client"], ["operator", "terminal"]]) {
    await assert.rejects(
      () => resolveAuthenticatedContext({ user: { id: "u", app_metadata: {} }, portal, loadMembership: async () => membership(role) }),
      (error) => error.code === "COMPANY_INACTIVE" && error.status === 403 && /suspendido/.test(error.message),
    );
  }
});

test("los flujos públicos revisan la empresa, y el retorno de un pago ya iniciado no", () => {
  const payments = read("./onStreetPaymentService.js");
  const start = (name) => payments.slice(payments.indexOf(`export async function ${name}`), payments.indexOf("\nexport async function", payments.indexOf(`export async function ${name}`) + 1));
  assert.match(start("createInitialPaymentIntent"), /location\.company\?\.status==="inactive"/);
  assert.match(start("createExtensionPaymentIntent"), /current\.location\.company\?\.status==="inactive"/);
  assert.match(start("startWebpayPayment"), /isParkingCompanyActive\(db,intent\.parking_id\)/);
  assert.doesNotMatch(start("processWebpayReturn"), /isParkingCompanyActive/);
  assert.match(read("../app/api/public/on-street/locations/[qrCode]/route.js"), /location\.company\?\.status==="inactive"/);
  assert.match(read("../app/api/pague-aqui/quote/route.js"), /isStayCompanyActive\(db, stayId\)/);
  assert.match(read("./onStreetSmsService.js"), /isSessionCompanyActive\(db, notification\.session_id\)/);
});

test("el cambio de estado es solo de Root y queda registrado en una transacción", () => {
  const route = read("../app/api/empresas/[id]/estado/route.js");
  assert.match(route, /requirePlatformAdmin\(authorization\.context\)/);
  assert.match(route, /rpc\("set_company_service_status"/);
  const migration = read("../../supabase/migrations/20261105005409_company_status_events.sql");
  assert.match(migration, /relationship_type <> 'client'/);
  assert.match(migration, /revoke all on function public\.set_company_service_status/);
  assert.match(migration, /enable row level security/);
});
