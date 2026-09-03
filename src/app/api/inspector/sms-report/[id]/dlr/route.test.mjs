import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

// TAREA 8 + TAREA 10.G/I: "Actualizar estado" -- solo consulta DLR.
test("solo exporta POST (acción explícita del usuario) -- nunca GET/PUT/PATCH/DELETE", () => {
  assert.match(source, /export async function POST\(/);
  for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});

test("TAREA 10.G/I: toda la lógica real vive en checkInspectorSmsDelivery -- esta ruta nunca importa registerOnStreetInspection/sendInspectionSmsIfNeeded/provider.send", () => {
  assert.match(source, /import \{ checkInspectorSmsDelivery \} from "@\/lib\/inspector\/inspectorSmsDeliveryService";/);
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "provider.send"]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test("exige autorización de Inspector igual que el resto de rutas", () => {
  assert.match(source, /const authorization = await authorizeInspectorRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("TAREA D: el scope SIEMPRE es 'own' -- consultar DLR de una fiscalización de otro inspector devuelve 404, nunca se llega a consultar el proveedor", () => {
  assert.match(source, /const scope = \{ type: "own", inspectorUserId: authorization\.context\.userId \};/);
  assert.match(source, /checkInspectorSmsDelivery\(id, authorization\.db, undefined, scope\)/);
});
