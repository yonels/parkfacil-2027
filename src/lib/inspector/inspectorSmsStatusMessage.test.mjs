import assert from "node:assert/strict";
import test from "node:test";
import { inspectorSmsStatusMessage } from "./inspectorSmsStatusMessage.mjs";

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
