import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

// 2026-09-03, "abrir detalle desde la lista de Fiscalizaciones" (TAREA 5.B/C
// a nivel de endpoint HTTP, complemento de inspectorRepository.test.mjs):
// esta ruta SOLO exporta GET -- ningún POST/PUT/PATCH/DELETE que pudiera
// escribir o reenviar SMS al abrir el detalle.
test("solo exporta GET -- ningún método de escritura", () => {
  assert.match(source, /export async function GET\(/);
  for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});

test("nunca importa registerOnStreetInspection ni ninguna función de envío de SMS -- solo getInspectorInspectionById (lectura)", () => {
  assert.match(source, /import \{ getInspectorInspectionById \} from "@\/lib\/inspector\/inspectorRepository";/);
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "sendInspectorCopySmsIfNeeded"]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test("exige autorización de Inspector igual que el resto de rutas (authorizeInspectorRequest)", () => {
  assert.match(source, /import \{ authorizeInspectorRequest \} from "@\/lib\/auth\/inspectorAuthorization";/);
  assert.match(source, /const authorization = await authorizeInspectorRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});
