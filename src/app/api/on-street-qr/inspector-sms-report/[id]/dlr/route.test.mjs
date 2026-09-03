import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

test("TAREA E: exige authorizeOnStreetAdminRequest", () => {
  assert.match(source, /const authorization = await authorizeOnStreetAdminRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("TAREA G/I: solo llama a checkInspectorSmsDelivery (nunca envía SMS ni registra otra fiscalización) con el scope admin resuelto", () => {
  assert.match(source, /import \{ checkInspectorSmsDelivery \} from "@\/lib\/inspector\/inspectorSmsDeliveryService";/);
  assert.match(source, /checkInspectorSmsDelivery\(id, authorization\.db, undefined, scope\)/);
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "provider.send"]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test("solo exporta POST", () => {
  assert.match(source, /export async function POST\(/);
  for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});
