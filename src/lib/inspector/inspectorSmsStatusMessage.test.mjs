import assert from "node:assert/strict";
import test from "node:test";
import { inspectorSmsStatusMessage, inspectorSmsShortStatus, inspectorCopySmsShortStatus, inspectorCopySmsFromPersistedStatus } from "./inspectorSmsStatusMessage.mjs";

test("SIMULATED: el mensaje deja explícito que NO se envió un SMS real (aunque sms_status sea SENT)", () => {
  const msg = inspectorSmsStatusMessage({ smsRequired: true, smsStatus: "SENT", smsProvider: "SIMULATED", smsProviderMessageId: "simulated-abc123" });
  assert.match(msg, /SIMULADO/);
  assert.match(msg, /no se envió un mensaje real/);
});

test("SIMULATED se detecta también por el prefijo 'simulated-' del providerMessageId, aunque smsProvider no venga informado (compatibilidad hacia atrás)", () => {
  const msg = inspectorSmsStatusMessage({ smsRequired: true, smsStatus: "SENT", smsProviderMessageId: "simulated-xyz" });
  assert.match(msg, /SIMULADO/);
});

test("SMS real (SENTRALAND) enviado: indica claramente que fue un envío real", () => {
  const msg = inspectorSmsStatusMessage({ smsRequired: true, smsStatus: "SENT", smsProvider: "SENTRALAND", smsProviderMessageId: "778899" });
  assert.match(msg, /Se envió el SMS real/);
  assert.doesNotMatch(msg, /SIMULADO/);
});

test("no requerido: no afirma que se envió nada", () => {
  const msg = inspectorSmsStatusMessage({ smsRequired: false });
  assert.match(msg, /No fue necesario/);
});

test("fallido: informa el fallo sin ocultar que la fiscalización sigue registrada", () => {
  const msg = inspectorSmsStatusMessage({ smsRequired: true, smsStatus: "FAILED" });
  assert.match(msg, /No fue posible enviar/);
  assert.match(msg, /quedó registrada de todas formas/);
});

test("nunca afirma 'enviado' para un estado que no sea SENT confirmado", () => {
  for (const smsStatus of ["PENDING", "SENDING", undefined, null]) {
    const msg = inspectorSmsStatusMessage({ smsRequired: true, smsStatus });
    assert.doesNotMatch(msg, /Se envió/);
  }
});

test("registro null/undefined no lanza -- se trata como 'no requerido' de forma segura", () => {
  assert.doesNotThrow(() => inspectorSmsStatusMessage(null));
  assert.doesNotThrow(() => inspectorSmsStatusMessage(undefined));
});

// --- 2026-09-03, "decouple printing + sms copy": filas compactas ---

test("inspectorSmsShortStatus: Enviado/Error/Pendiente/No requerido, tono correcto en cada caso", () => {
  assert.deepEqual(inspectorSmsShortStatus({ smsRequired: false }), { label: "No requerido", tone: "neutral" });
  assert.deepEqual(inspectorSmsShortStatus({ smsRequired: true, smsStatus: "SENT" }), { label: "Enviado", tone: "success" });
  assert.deepEqual(inspectorSmsShortStatus({ smsRequired: true, smsStatus: "FAILED" }), { label: "Error", tone: "error" });
  assert.deepEqual(inspectorSmsShortStatus({ smsRequired: true, smsStatus: "PENDING" }), { label: "Pendiente", tone: "neutral" });
  assert.doesNotThrow(() => inspectorSmsShortStatus(null));
});

test("inspectorCopySmsShortStatus: ausencia de teléfono es 'No configurada' (neutral, nunca error)", () => {
  const status = inspectorCopySmsShortStatus({ smsRequired: true, inspectorCopySms: { attempted: false, phoneConfigured: false } });
  assert.deepEqual(status, { label: "No configurada", tone: "neutral" });
});

test("inspectorCopySmsShortStatus: enviada exitosamente", () => {
  const status = inspectorCopySmsShortStatus({ smsRequired: true, inspectorCopySms: { attempted: true, phoneConfigured: true, sent: true } });
  assert.deepEqual(status, { label: "Enviada", tone: "success" });
});

test("inspectorCopySmsShortStatus: fallo del proveedor es 'Error', nunca invalida la fila de fiscalización", () => {
  const status = inspectorCopySmsShortStatus({ smsRequired: true, inspectorCopySms: { attempted: true, phoneConfigured: true, sent: false } });
  assert.deepEqual(status, { label: "Error", tone: "error" });
});

test("inspectorCopySmsShortStatus: no aplica cuando el tipo de fiscalización no requiere SMS (no OVERSTAY)", () => {
  assert.deepEqual(inspectorCopySmsShortStatus({ smsRequired: false }), { label: "No aplica", tone: "neutral" });
});

// 2026-09-03, "persist inspector sms copy trace", regla D -- SMS conductor
// falló, la copia nunca se intenta: NO debe confundirse con "No
// configurada" (ese caso es phoneConfigured===false explícito, este es
// skipped===true con phoneConfigured indefinido).
test("inspectorCopySmsShortStatus: 'skipped' (SMS conductor falló) es un estado propio, NUNCA se confunde con 'No configurada'", () => {
  const status = inspectorCopySmsShortStatus({ smsRequired: true, inspectorCopySms: { attempted: false, skipped: true } });
  assert.equal(status.label, "No enviada (SMS conductor falló)");
  assert.equal(status.tone, "neutral");
  assert.notEqual(status.label, "No configurada");
});

// --- 2026-09-03, "abrir detalle desde la lista de Fiscalizaciones" ---

test("inspectorCopySmsFromPersistedStatus: reconstruye la MISMA forma efímera que produce sendInspectorCopySmsIfNeeded en vivo, a partir de la columna persistida", () => {
  assert.deepEqual(inspectorCopySmsFromPersistedStatus("SENT"), { attempted: true, phoneConfigured: true, sent: true });
  assert.deepEqual(inspectorCopySmsFromPersistedStatus("FAILED"), { attempted: true, phoneConfigured: true, sent: false });
  assert.deepEqual(inspectorCopySmsFromPersistedStatus("NOT_CONFIGURED"), { attempted: false, phoneConfigured: false });
  assert.deepEqual(inspectorCopySmsFromPersistedStatus("SKIPPED"), { attempted: false, skipped: true });
});

test("inspectorCopySmsFromPersistedStatus: null/undefined/valor desconocido -> null ('no aplicaba'), nunca lanza", () => {
  assert.equal(inspectorCopySmsFromPersistedStatus(null), null);
  assert.equal(inspectorCopySmsFromPersistedStatus(undefined), null);
  assert.equal(inspectorCopySmsFromPersistedStatus("ALGO_INESPERADO"), null);
});

test("round-trip: inspectorCopySmsShortStatus(inspectorCopySmsFromPersistedStatus(x)) da la MISMA etiqueta que el flujo en vivo para cada estado real", () => {
  const casos = [
    ["SENT", "Enviada", "success"],
    ["FAILED", "Error", "error"],
    ["NOT_CONFIGURED", "No configurada", "neutral"],
    ["SKIPPED", "No enviada (SMS conductor falló)", "neutral"],
  ];
  for (const [persisted, label, tone] of casos) {
    const status = inspectorCopySmsShortStatus({ smsRequired: true, inspectorCopySms: inspectorCopySmsFromPersistedStatus(persisted) });
    assert.equal(status.label, label, persisted);
    assert.equal(status.tone, tone, persisted);
  }
});
