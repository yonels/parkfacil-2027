import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./route.js", import.meta.url), "utf8");

// TAREA 7 + TAREA 10.H: detalle de solo lectura.
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

test("TAREA 9: incluye copia inspector en la respuesta (status/sentAt/providerMessageId), separada del SMS conductor", () => {
  assert.match(source, /inspectorCopySms: inspectorCopySmsFromPersistedStatus\(row\.inspector_copy_sms_status\)/);
  assert.match(source, /inspectorCopySmsSentAt: row\.inspector_copy_sms_sent_at/);
  assert.match(source, /inspectorCopySmsProviderMessageId: row\.inspector_copy_sms_provider_message_id/);
});

test("exige autorización de Inspector igual que el resto de rutas", () => {
  assert.match(source, /const authorization = await authorizeInspectorRequest\(request\);/);
  assert.match(source, /if \(authorization\.response\) return authorization\.response;/);
});

test("TAREA C: el scope SIEMPRE es 'own' -- getInspectorSmsReportDetail lo recibe, así que un id de otro inspector nunca se devuelve (404, no distinguible de 'no existe')", () => {
  assert.match(source, /const scope = \{ type: "own", inspectorUserId: authorization\.context\.userId \};/);
  assert.match(source, /getInspectorSmsReportDetail\(id, authorization\.db, scope\)/);
});
