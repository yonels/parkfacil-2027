import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

test("TAREA E: exige authorizeOnStreetAdminRequest -- mismo candado del resto del backoffice", () => {
  assert.match(source, /const authorization = await authorizeOnStreetAdminRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("resuelve scope y lo pasa a getInspectorSmsReportDetail -- un company_admin pidiendo el id de otra empresa recibe 404", () => {
  assert.match(source, /const scope = await resolveInspectorSmsReportAdminScope\(authorization\.db, authorization\.context\);/);
  assert.match(source, /getInspectorSmsReportDetail\(id, authorization\.db, scope\)/);
});

test("solo exporta GET", () => {
  assert.match(source, /export async function GET\(/);
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});
