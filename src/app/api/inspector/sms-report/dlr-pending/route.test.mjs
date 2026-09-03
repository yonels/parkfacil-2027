import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");
const withoutComments = source.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

// TAREA 8 "Actualizar pendientes" + TAREA 10.G/I.
test("solo exporta POST", () => {
  assert.match(source, /export async function POST\(/);
  for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
    assert.ok(!source.includes(`export async function ${metodo}(`), `no debe exportar ${metodo}`);
  }
});

test("TAREA 8: no implementa ningún cron nuevo -- es una acción disparada a demanda (checkPendingInspectorSmsDeliveries), sin scheduler propio", () => {
  assert.doesNotMatch(withoutComments, /cron|schedule/i);
  assert.match(source, /import \{ checkPendingInspectorSmsDeliveries \} from "@\/lib\/inspector\/inspectorSmsDeliveryService";/);
});

test("exige autorización de Inspector igual que el resto de rutas", () => {
  assert.match(source, /const authorization = await authorizeInspectorRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("scope SIEMPRE es 'own' -- 'Actualizar pendientes' de un Inspector nunca toca mensajes de otro inspector", () => {
  assert.match(source, /const scope = \{ type: "own", inspectorUserId: authorization\.context\.userId \};/);
  assert.match(withoutComments, /checkPendingInspectorSmsDeliveries\(authorization\.db, undefined, undefined, scope\)/);
});
