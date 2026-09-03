import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// inspectorSmsDeliveryService.js importa "server-only" -- se verifica por
// inspección de código fuente, mismo criterio que inspectorRepository.test.mjs.
const source = await readFile(new URL("./inspectorSmsDeliveryService.js", import.meta.url), "utf8");

// TAREA 10.G: consultar DLR nunca envía un SMS.
test("TAREA 10.G: checkInspectorSmsDelivery/checkPendingInspectorSmsDeliveries solo llaman a provider.checkStatus, NUNCA provider.send", () => {
  assert.match(source, /provider\.checkStatus\(/);
  assert.doesNotMatch(source, /provider\.send\(/);
});

// TAREA 10.I: consultar DLR nunca registra otra fiscalización.
test("TAREA 10.I: nunca importa ni menciona registerOnStreetInspection/sendInspectionSmsIfNeeded/sendInspectorCopySmsIfNeeded -- consultar DLR no puede duplicar la fiscalización ni reenviar SMS", () => {
  for (const forbidden of ["registerOnStreetInspection", "sendInspectionSmsIfNeeded", "sendInspectorCopySmsIfNeeded"]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test("nunca toca sms_status/sms_sent_at/sms_provider_message_id -- solo persistInspectorSmsDeliveryStatus (las 3 columnas de entrega)", () => {
  assert.doesNotMatch(source, /smsStatus:|sms_status:/);
  assert.match(source, /persistInspectorSmsDeliveryStatus\(/);
});

test("exige sms_status==='SENT' y provider_message_id presente antes de consultar -- nunca inventa una consulta para algo que nunca se envió", () => {
  assert.match(source, /row\.sms_status !== "SENT" \|\| !row\.sms_provider_message_id/);
});

test("un fallo transitorio al actualizar pendientes en lote no detiene el resto -- se reintenta en la próxima corrida", () => {
  const bulkFn = source.slice(source.indexOf("export async function checkPendingInspectorSmsDeliveries"));
  assert.match(bulkFn, /catch \{\s*continue;/);
});

// --- TAREA C/D (alcance RBAC, 2026-09-03) ---
test("TAREA D: checkInspectorSmsDelivery exige `scope` explícito -- sin scope, falla ruidoso (SCOPE_REQUIRED) en vez de caer a alcance global por defecto", () => {
  const fn = source.slice(source.indexOf("export async function checkInspectorSmsDelivery"), source.indexOf("export async function checkPendingInspectorSmsDeliveries"));
  assert.match(fn, /if \(!scope\) throw error\("SCOPE_REQUIRED", 500\);/);
});

test("TAREA C/D: checkInspectorSmsDelivery reenvía `scope` a getInspectorSmsReportDetail -- una fiscalización fuera de alcance nunca llega a consultarse ni a persistirse", () => {
  const fn = source.slice(source.indexOf("export async function checkInspectorSmsDelivery"), source.indexOf("export async function checkPendingInspectorSmsDeliveries"));
  assert.match(fn, /getInspectorSmsReportDetail\(id, db, scope\)/);
  assert.match(fn, /if \(!row\) throw error\("INSPECTION_NOT_FOUND", 404\);/);
});

test("checkPendingInspectorSmsDeliveries también exige `scope` explícito y lo reenvía a listPendingInspectorSmsDeliveryChecks", () => {
  const fn = source.slice(source.indexOf("export async function checkPendingInspectorSmsDeliveries"));
  assert.match(fn, /if \(!scope\) throw error\("SCOPE_REQUIRED", 500\);/);
  assert.match(fn, /listPendingInspectorSmsDeliveryChecks\(db, limit, scope\)/);
});
