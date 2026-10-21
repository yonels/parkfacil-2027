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

// --- 2026-09-03, "Reporte SMS Inspector" (TAREA 10.H) ---

function bodyOf(fnName) {
  const start = source.indexOf(`export async function ${fnName}`);
  assert.ok(start >= 0, `${fnName} debe existir`);
  return source.slice(start, source.indexOf("\n}", start));
}

test("TAREA 10.H: listInspectorSmsReportRows/getInspectorSmsReportDetail/listPendingInspectorSmsDeliveryChecks son SOLO LECTURA -- ningún .insert/.update/.delete/.upsert", () => {
  for (const fn of ["listInspectorSmsReportRows", "getInspectorSmsReportDetail", "listPendingInspectorSmsDeliveryChecks"]) {
    const body = bodyOf(fn);
    for (const forbidden of [".insert(", ".update(", ".delete(", ".upsert("]) {
      assert.ok(!body.includes(forbidden), `${fn} no debe llamar a ${forbidden}`);
    }
  }
});

test("listInspectorSmsReportRows/getInspectorSmsReportDetail/listPendingInspectorSmsDeliveryChecks seleccionan las columnas de entrega (sms_delivery_status/_checked_at/_description) -- vía la misma constante compartida SMS_REPORT_COLUMNS, nunca duplicada por función", () => {
  assert.match(source, /const SMS_REPORT_COLUMNS = "[^"]*sms_delivery_status,sms_delivery_checked_at,sms_delivery_description[^"]*";/);
  for (const fn of ["listInspectorSmsReportRows", "getInspectorSmsReportDetail"]) {
    assert.match(bodyOf(fn), /\.select\(SMS_REPORT_COLUMNS\)/);
  }
});

test("persistInspectorSmsDeliveryStatus SOLO escribe las 3 columnas de entrega (+ updated_at) -- nunca sms_status/sms_sent_at/sms_provider_message_id", () => {
  const body = bodyOf("persistInspectorSmsDeliveryStatus");
  assert.match(body, /sms_delivery_status:/);
  assert.match(body, /sms_delivery_checked_at:/);
  assert.match(body, /sms_delivery_description:/);
  assert.doesNotMatch(body, /sms_status:|sms_sent_at:|sms_provider_message_id:/);
});

// --- Alcance RBAC (2026-09-03, agregado tras revisión) ---

test("TAREA A/B/E: listInspectorSmsReportRows/getInspectorSmsReportDetail/listPendingInspectorSmsDeliveryChecks SIEMPRE aplican el scope recibido -- applyInspectorSmsReportScope, nunca una consulta sin acotar por defecto", () => {
  for (const fn of ["listInspectorSmsReportRows", "getInspectorSmsReportDetail", "listPendingInspectorSmsDeliveryChecks"]) {
    assert.match(bodyOf(fn), /applyInspectorSmsReportScope\(query, scope\)/);
  }
});

test("fail-closed a nivel SQL: applyInspectorSmsReportScope filtra a 0 filas ante cualquier scope que no sea own/company/global explícito -- nunca cae a 'sin filtro' por defecto", () => {
  const start = source.indexOf("function applyInspectorSmsReportScope");
  const body = source.slice(start, source.indexOf("\n}", start));
  assert.match(body, /scope\?\.type === "own"/);
  assert.match(body, /scope\?\.type === "company"/);
  assert.match(body, /scope\?\.type === "global"/);
  assert.match(body, /00000000-0000-0000-0000-000000000000/, "el fallback debe filtrar a un id imposible, no devolver la query sin filtro");
});

test("TAREA C/D: getInspectorSmsReportDetail re-verifica la fila ya traída contra el scope (inspectorSmsReportRowInScope) antes de devolverla -- defensa en profundidad, no confía solo en el filtro SQL", () => {
  assert.match(source, /import \{ inspectorSmsReportRowInScope \} from "\.\/inspectorSmsReportCore\.mjs";/);
  assert.match(bodyOf("getInspectorSmsReportDetail"), /if \(!inspectorSmsReportRowInScope\(result\.data, scope\)\) return null;/);
});

test("inspectorEmailById ya NO se usa desde el portal Inspector (solo desde el admin) -- una cuenta Inspector no necesita la lista completa de otros inspectores", () => {
  assert.match(source, /export async function inspectorEmailById/, "sigue existiendo (la usa el admin)");
});
