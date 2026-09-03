import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

// Vista ADMIN del Reporte SMS (§2/§3 del pedido de alcance RBAC, 2026-09-03).
test("TAREA E: exige authorizeOnStreetAdminRequest -- el MISMO candado ya usado por el resto del backoffice On Street (platform_admin/company_admin, ON_STREET_QR_READ), nunca uno nuevo ni más débil", () => {
  assert.match(source, /import \{ authorizeOnStreetAdminRequest \} from "@\/lib\/onStreetAdminAuthorization";/);
  assert.match(source, /const authorization = await authorizeOnStreetAdminRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("resuelve el scope vía resolveInspectorSmsReportAdminScope -- nunca hardcodea 'global' para ningún rol", () => {
  assert.match(source, /import \{ resolveInspectorSmsReportAdminScope \} from "@\/lib\/inspector\/inspectorSmsReportAdminScope";/);
  assert.match(source, /const scope = await resolveInspectorSmsReportAdminScope\(authorization\.db, authorization\.context\);/);
  assert.match(source, /listInspectorSmsReportRows\(authorization\.db, \{ from: bounds\.from, to: bounds\.to, scope \}\)/);
});

test("TAREA F: SÍ consulta inspectorEmailById (lista de inspectores) -- a diferencia del portal Inspector, aquí el filtro 'Inspector' tiene sentido", () => {
  assert.match(source, /inspectorEmailById\(authorization\.db\)/);
});

test("solo exporta GET -- ningún método de escritura", () => {
  assert.match(source, /export async function GET\(/);
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});

test("nunca importa funciones de escritura/envío", () => {
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "sendInspectorCopySmsIfNeeded", "persistInspectorSmsDeliveryStatus", "checkInspectorSmsDelivery"]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});
