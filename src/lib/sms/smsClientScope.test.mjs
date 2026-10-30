// Reportes SMS para el administrador de empresa (SOL-2026-10-29-007):
// solo lectura y solo su empresa. Uso: node --test src/lib/sms/smsClientScope.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canAccessPath, ROLES } from "../auth/permissions.mjs";
import { clientSafeConsumption, clientSafeSummary, parseSmsFilters, scopeSmsFilters, smsCompanyScope } from "./smsHistoryCore.mjs";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const companyAdmin = { portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: ["ON_STREET", "OFF_STREET"], companyId: "c1" };

test("alcance: solo el administrador de empresa del Portal Cliente queda acotado a su empresa", () => {
  assert.equal(smsCompanyScope(companyAdmin), "c1");
  assert.equal(smsCompanyScope({ portal: "root", role: ROLES.PLATFORM_ADMIN, companyId: null }), null);
  assert.equal(smsCompanyScope({ portal: "terminal", role: ROLES.OPERATOR, companyId: "c1" }), null);
  assert.equal(smsCompanyScope({ portal: "client", role: ROLES.COMPANY_ADMIN, companyId: null }), null);
});

test("alcance: la empresa del servidor reemplaza la que llegue en la URL", () => {
  const filters = parseSmsFilters(new URLSearchParams({ empresa: "otra-empresa" }));
  assert.equal(scopeSmsFilters(filters, "c1").companyId, "c1");
  assert.equal(scopeSmsFilters(filters, null).companyId, "otra-empresa");
  assert.equal(scopeSmsFilters(parseSmsFilters(new URLSearchParams()), "c1").companyId, "c1");
});

test("cliente: el resumen no expone saldo de la bolsa ni SMS recibidos", () => {
  const safe = clientSafeSummary({ kpis: { total: 3 }, last_balance: { balance: { bags: [{ saldo: 100 }] } }, inbound: 2, inbound_enabled: true });
  assert.deepEqual(safe, { kpis: { total: 3 }, viewer: "COMPANY" });
});

test("cliente: el consumo no expone costos, tarifas, saldo ni otras empresas", () => {
  const safe = clientSafeConsumption({
    total: 5, priced: 5, mixed_currency: false, cost_by_currency: { CLP: 60 }, tariffs: [{ id: "t" }], lastBalance: { balance: 1 },
    by_company: [{ company_id: "c2", count: 9 }],
    by_module: [{ module: "ON_STREET", count: 5, cost: 60, currency: "CLP" }],
    by_parking: [{ parking_id: "p1", company_id: "c1", count: 5, cost: 60, currency: "CLP", name: "P1" }],
    by_period: [{ bucket: "2026-10-01", count: 5, cost: 60 }],
  });
  assert.deepEqual(safe, {
    total: 5,
    by_module: [{ module: "ON_STREET", count: 5 }],
    by_parking: [{ parking_id: "p1", company_id: "c1", count: 5, name: "P1" }],
    by_period: [{ bucket: "2026-10-01", count: 5 }],
    viewer: "COMPANY",
  });
});

test("rutas: el administrador de empresa ve Resumen, Historial y Consumo; el resto sigue siendo solo de Root", () => {
  for (const path of ["/centro-sms", "/centro-sms/historial", "/centro-sms/consumo"]) assert.equal(canAccessPath(companyAdmin, path), true, path);
  for (const path of ["/centro-sms/recibidos", "/centro-sms/fallos", "/centro-sms/diagnostico", "/centro-sms/configuracion"]) {
    assert.equal(canAccessPath(companyAdmin, path), false, path);
    assert.equal(canAccessPath({ portal: "root", role: ROLES.PLATFORM_ADMIN }, path), true, path);
  }
  assert.equal(canAccessPath({ portal: "terminal", role: ROLES.OPERATOR, companyId: "c1" }, "/centro-sms/historial"), false);
});

test("API: las lecturas fuerzan el alcance; envíos, reenvíos, teléfono completo y configuración siguen solo para Root", async () => {
  const scoped = ["resumen", "historial", "exportar", "consumo"];
  for (const name of scoped) {
    const source = await read(`src/app/api/centro-sms/${name}/route.js`);
    assert.match(source, /authorizeSmsReadRequest\(/, name);
    assert.match(source, /scopeSmsFilters\(.*authorization\.companyScope\)/, name);
  }
  assert.match(await read("src/app/api/centro-sms/historial/[source]/[id]/route.js"), /authorizeSmsReadRequest\(/);
  assert.match(await read("src/app/api/centro-sms/opciones/route.js"), /listSmsFilterOptions\(undefined, authorization\.companyScope\)/);
  const repository = await read("src/lib/sms/smsCenterRepository.js");
  assert.match(repository, /loadHistoryRow\(db, source, sourceId, context\?\.smsCompanyScope \|\| null\)/);
  assert.match(repository, /if \(companyScope\) query = query\.eq\("company_id", companyScope\)/);
  const rootOnly = ["recibidos", "fallos", "fallos/[source]/[id]/reenviar", "fallos/[source]/[id]/cancelar", "diagnostico", "diagnostico/prueba", "diagnostico/prueba/[id]/estado", "configuracion", "configuracion/retencion", "tarifas", "tarifas/[id]", "procesar", "historial/[source]/[id]/telefono"];
  for (const name of rootOnly) {
    const source = await read(`src/app/api/centro-sms/${name}/route.js`);
    assert.match(source, /authorizeSmsRequest\(request/, name);
    assert.doesNotMatch(source, /authorizeSmsReadRequest/, name);
  }
  const auth = await read("src/lib/sms/smsApiAuth.js");
  assert.match(auth, /export async function authorizeSmsRequest[\s\S]*?requirePlatformAdmin\(authorization\.context\)/);
});
