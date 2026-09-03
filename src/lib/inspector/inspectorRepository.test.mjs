import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// inspectorRepository.js importa "server-only" (paquete que solo resuelve
// dentro del bundler de Next, ni siquiera está en node_modules) -- por eso,
// igual que el resto de tests de Inspector, esto se verifica por inspección
// del código fuente, nunca importando el módulo real (ver el mismo criterio
// documentado en InspectorFiscalizacion.test.mjs y CourtesyTicketPrint.
// reprint.test.mjs: "no hay jsdom en este proyecto").
const source = await readFile(new URL("./inspectorRepository.js", import.meta.url), "utf8");
const getBody = source.slice(
  source.indexOf("export async function getInspectorInspectionById"),
  source.indexOf("\n}", source.indexOf("export async function getInspectorInspectionById")),
);

// 2026-09-03, "abrir detalle desde la lista de Fiscalizaciones" (TAREA 5.B/C):
// getInspectorInspectionById es el ÚNICO camino nuevo para reabrir una
// fiscalización ya existente -- debe ser SOLO LECTURA, sin excepción: ni un
// INSERT/UPDATE/DELETE, ni ninguna llamada relacionada con el envío de SMS
// (register_on_street_inspection/sendInspectionSmsIfNeeded/provider alguno).
test("TAREA 5.B: getInspectorInspectionById es puramente de lectura -- solo .select(...).eq(...).eq(...).maybeSingle(), ningún .insert/.update/.delete/.upsert", () => {
  assert.match(getBody, /\.select\(/);
  assert.match(getBody, /\.maybeSingle\(\)/);
  for (const forbidden of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!getBody.includes(forbidden), `getInspectorInspectionById no debe llamar a ${forbidden}`);
  }
});

test("TAREA 5.C: getInspectorInspectionById nunca envía SMS -- no menciona registerOnStreetInspection/sendInspectionSmsIfNeeded/sendInspectorCopySmsIfNeeded/provider alguno", () => {
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "sendInspectorCopySmsIfNeeded", "resolveSmsProvider", "provider.send"]) {
    assert.ok(!getBody.includes(forbidden), `getInspectorInspectionById no debe mencionar ${forbidden}`);
  }
});

test("acotada al propio inspector (mismo criterio que listInspectorInspections): filtra por id Y por inspector_user_id -- nunca expone la fiscalización de otro inspector", () => {
  assert.match(getBody, /\.eq\("id", id\)/);
  assert.match(getBody, /\.eq\("inspector_user_id", inspectorUserId\)/);
});

test("propaga el error de la consulta sin ocultarlo (mismo criterio que el resto del repositorio) y devuelve null sin distinguir 'no existe' de 'es de otro inspector'", () => {
  assert.match(getBody, /if \(result\.error\) throw result\.error;/);
  assert.match(getBody, /return result\.data \|\| null;/);
});

test("selecciona exactamente las columnas necesarias para reabrir la pantalla de resultado, incluida la trazabilidad de copia inspector (migración 20260903011348)", () => {
  assert.match(getBody, /id,license_plate_normalized,inspection_type,inspected_at,sms_required,sms_status,inspector_copy_sms_status,inspector_copy_sms_sent_at,inspector_copy_sms_provider_message_id/);
});
