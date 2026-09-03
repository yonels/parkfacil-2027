import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

test("TAREA E: exige authorizeOnStreetAdminRequest", () => {
  assert.match(source, /const authorization = await authorizeOnStreetAdminRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("no implementa ningún cron nuevo -- acción a demanda con el scope admin resuelto", () => {
  assert.doesNotMatch(withoutComments, /cron|schedule/i);
  assert.match(source, /checkPendingInspectorSmsDeliveries\(authorization\.db, undefined, undefined, scope\)/);
});

test("solo exporta POST", () => {
  assert.match(source, /export async function POST\(/);
  for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});
