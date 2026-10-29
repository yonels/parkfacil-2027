import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIdempotencyKey,
  classifySendOutcome,
  isUnconfirmed,
  maskPhone,
  nextRetryDelaySeconds,
  normalizeChileanMobile,
  prepareSendRequest,
  resendEligibility,
  sanitizeProviderDetail,
  SMS_STATUS,
  SMS_STATUS_LABELS,
  statusFromDeliveryState,
  validateSmsBody,
} from "./smsCenterCore.mjs";

test("teléfonos chilenos: formatos habituales se normalizan a +569XXXXXXXX", () => {
  for (const input of ["+56966514044", "+56 9 6651 4044", "56966514044", "966514044", "9 6651 4044", "(+56) 9-6651-4044", "0056966514044"]) {
    assert.equal(normalizeChileanMobile(input), "+56966514044", input);
  }
});

test("teléfonos chilenos: fijos, extranjeros, cortos y basura se rechazan", () => {
  for (const input of ["+56226514044", "226514044", "+5491166514044", "+1 202 555 0100", "96651404", "9665140444", "abc966514044", "", null, undefined, "+56+966514044", "9+66514044"]) {
    assert.equal(normalizeChileanMobile(input), null, String(input));
  }
});

test("enmascarado: solo los últimos 4 dígitos", () => {
  assert.equal(maskPhone("+56966514044"), "+56 9 ****4044");
  assert.equal(maskPhone(null, "1234"), "+56 9 ****1234");
  assert.equal(maskPhone(null), "No registrado");
});

test("texto: vacío y más de 160 caracteres se rechazan; tildes solo advierten", () => {
  assert.equal(validateSmsBody("  ").code, "SMS_BODY_EMPTY");
  assert.equal(validateSmsBody("x".repeat(161)).code, "SMS_BODY_TOO_LONG");
  assert.deepEqual(validateSmsBody("x".repeat(160)).warnings, []);
  assert.deepEqual(validateSmsBody("Verificación").warnings, ["NON_GSM_CHARACTERS"]);
  const suggested = "ParkFacil: Prueba de servicio SMS Sentraland. Verificacion de envio y recepcion. No requiere respuesta.";
  assert.equal(validateSmsBody(suggested).ok, true);
  assert.deepEqual(validateSmsBody(suggested).warnings, []);
});

test("estados: los 11 estados requeridos tienen etiqueta en español", () => {
  assert.equal(Object.keys(SMS_STATUS).length, 11);
  for (const status of Object.values(SMS_STATUS)) assert.ok(SMS_STATUS_LABELS[status], status);
  assert.equal(SMS_STATUS_LABELS.ACCEPTED, "Aceptado por proveedor");
  assert.notEqual(SMS_STATUS.ACCEPTED, SMS_STATUS.DELIVERED);
});

test("Sentraland codigo=0 => ACEPTADO (nunca entregado)", () => {
  const outcome = classifySendOutcome({ result: { ok: true, providerMessageId: "abc", providerStatus: "0", providerDescription: "Ok mensaje enviado" } });
  assert.equal(outcome.status, "ACCEPTED");
  assert.equal(outcome.retryable, false);
});

test("Sentraland códigos de error => categoría y reintento", () => {
  const cases = {
    1: ["REJECTED", "PROVIDER_REJECTED", false],
    2: ["REJECTED", "NO_BALANCE", false],
    4: ["REJECTED", "INVALID_PHONE", false],
    13: ["REJECTED", "INVALID_PHONE", false],
    6: ["REJECTED", "VALIDATION", false],
    7: ["FAILED", "TEMPORARY", true],
    12: ["FAILED", "TEMPORARY", true],
    20: ["FAILED", "TEMPORARY", true],
    8: ["UNKNOWN", "UNKNOWN", false],
    11: ["UNKNOWN", "UNKNOWN", false],
    99: ["REJECTED", "PROVIDER_REJECTED", false],
  };
  for (const [code, [status, category, retryable]] of Object.entries(cases)) {
    const outcome = classifySendOutcome({ result: { ok: false, providerStatus: String(code), errorCode: `SENTRALAND_${code}` } });
    assert.deepEqual([outcome.status, outcome.category, outcome.retryable], [status, category, retryable], `codigo ${code}`);
    assert.equal(outcome.errorCode, `SENTRALAND_${code}`);
  }
});

test("timeout durante el ENVÍO => estado desconocido, sin reintento automático (evita duplicados)", () => {
  const outcome = classifySendOutcome({ error: { code: "SENTRALAND_TIMEOUT", smsPhase: "SEND" } });
  assert.equal(outcome.status, "UNKNOWN");
  assert.equal(outcome.retryable, false);
  const invalid = classifySendOutcome({ error: { code: "SENTRALAND_RESPONSE_INVALID", smsPhase: "SEND" } });
  assert.equal(invalid.status, "UNKNOWN");
  const http500 = classifySendOutcome({ error: { code: "SENTRALAND_HTTP_ERROR", status: 500, smsPhase: "SEND" } });
  assert.equal(http500.status, "UNKNOWN");
});

test("fallo en la fase TOKEN => fallido reintentable (el SMS no salió)", () => {
  for (const error of [{ code: "SENTRALAND_TIMEOUT", smsPhase: "TOKEN" }, { code: "SENTRALAND_HTTP_ERROR", status: 503, smsPhase: "TOKEN" }, { code: "SENTRALAND_TOKEN_ERROR", providerCode: 1 }]) {
    const outcome = classifySendOutcome({ error });
    assert.equal(outcome.status, "FAILED");
    assert.equal(outcome.retryable, true);
  }
  assert.equal(classifySendOutcome({ error: { code: "SENTRALAND_HTTP_ERROR", status: 401, smsPhase: "TOKEN" } }).category, "AUTH");
});

test("configuración y validación => fallido no reintentable", () => {
  assert.deepEqual(pick(classifySendOutcome({ error: { code: "SENTRALAND_PASSWORD_NOT_CONFIGURED" } })), ["FAILED", "CONFIG", false]);
  assert.deepEqual(pick(classifySendOutcome({ error: { code: "SENTRALAND_PHONE_INVALID", smsPhase: "SEND" } })), ["FAILED", "INVALID_PHONE", false]);
  assert.deepEqual(pick(classifySendOutcome({ error: { code: "SENTRALAND_MESSAGE_TOO_LONG", smsPhase: "SEND" } })), ["FAILED", "VALIDATION", false]);
  assert.deepEqual(pick(classifySendOutcome({ error: { code: "SENTRALAND_HTTP_ERROR", status: 400, smsPhase: "SEND" } })), ["FAILED", "CONNECTIVITY", false]);
});

function pick(outcome) { return [outcome.status, outcome.category, outcome.retryable]; }

test("DLR (smsstatus) => estado del centro", () => {
  assert.equal(statusFromDeliveryState("DELIVERED"), "DELIVERED");
  assert.equal(statusFromDeliveryState("ACCEPTED"), "PENDING_CONFIRMATION");
  assert.equal(statusFromDeliveryState("UNDELIVERED"), "FAILED");
  assert.equal(statusFromDeliveryState("EXPIRED"), "EXPIRED");
  assert.equal(statusFromDeliveryState("REJECTED"), "REJECTED");
  assert.equal(statusFromDeliveryState("UNKNOWN"), "UNKNOWN");
  assert.equal(statusFromDeliveryState(undefined), "UNKNOWN");
});

test("reintentos: esperas progresivas y límite", () => {
  const options = { maxAttempts: 3, delaysSeconds: [60, 300, 900] };
  assert.equal(nextRetryDelaySeconds(1, options), 60);
  assert.equal(nextRetryDelaySeconds(2, options), 300);
  assert.equal(nextRetryDelaySeconds(3, options), null);
  assert.equal(nextRetryDelaySeconds(1, { maxAttempts: 1 }), null);
  assert.equal(nextRetryDelaySeconds(5, { maxAttempts: 6, delaysSeconds: [10] }), 10);
  assert.equal(nextRetryDelaySeconds(0, options), null);
});

test("reenvío manual: solo finales no entregados; UNKNOWN exige aceptar el riesgo de duplicado", () => {
  assert.equal(resendEligibility({ status: "FAILED" }).ok, true);
  assert.equal(resendEligibility({ status: "REJECTED", error_category: "NO_BALANCE" }).ok, true);
  assert.equal(resendEligibility({ status: "DELIVERED" }).code, "STATUS_NOT_RESENDABLE");
  assert.equal(resendEligibility({ status: "ACCEPTED" }).code, "STATUS_NOT_RESENDABLE");
  assert.equal(resendEligibility({ status: "UNKNOWN" }).code, "DUPLICATE_RISK_NOT_ACKNOWLEDGED");
  assert.equal(resendEligibility({ status: "UNKNOWN" }, { acknowledgeDuplicateRisk: true }).duplicateRisk, true);
  assert.equal(resendEligibility({ status: "REJECTED", error_category: "INVALID_PHONE" }).code, "INVALID_PHONE");
  assert.equal(resendEligibility({ status: "FAILED", redacted_at: "2026-01-01" }).code, "REDACTED");
  assert.equal(resendEligibility(null).code, "NOT_FOUND");
});

test("sin confirmación: aceptado real más antiguo que el umbral; simulados nunca", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  assert.equal(isUnconfirmed({ status: "ACCEPTED", accepted_at: "2026-10-28T11:00:00Z" }, { now, afterHours: 24 }), true);
  assert.equal(isUnconfirmed({ status: "ACCEPTED", accepted_at: "2026-10-29T11:00:00Z" }, { now, afterHours: 24 }), false);
  assert.equal(isUnconfirmed({ status: "ACCEPTED", is_simulated: true, accepted_at: "2026-10-01T00:00:00Z" }, { now }), false);
  assert.equal(isUnconfirmed({ status: "DELIVERED", accepted_at: "2026-10-01T00:00:00Z" }, { now }), false);
});

test("respuesta técnica saneada: nunca guarda credenciales ni token", () => {
  const clean = sanitizeProviderDetail({ codigo: 0, token: "T", password: "P", usuario: "U", institucion: "I", nested: { Authorization: "Bearer x", ok: 1 }, list: [{ apiKey: "k", v: 2 }] });
  assert.deepEqual(clean, { codigo: 0, nested: { ok: 1 }, list: [{ v: 2 }] });
  assert.doesNotMatch(JSON.stringify(clean), /"T"|"P"|"U"|"I"|Bearer/);
});

test("clave de idempotencia: formato controlado", () => {
  assert.equal(buildIdempotencyKey("test", "abc-123"), "test:abc-123");
  assert.throws(() => buildIdempotencyKey("a b"), { code: "SMS_IDEMPOTENCY_KEY_INVALID" });
  assert.throws(() => buildIdempotencyKey("x"), { code: "SMS_IDEMPOTENCY_KEY_INVALID" });
  // Reenvío desde un registro heredado: resend:<origen>:<uuid>:<uuid> (~105 caracteres).
  const resendKey = `resend:ON_STREET_INSPECTION:${"a".repeat(8)}-1111-4222-8333-444444444444:${"b".repeat(8)}-1111-4222-8333-444444444444`;
  assert.equal(buildIdempotencyKey(resendKey), resendKey);
  assert.throws(() => buildIdempotencyKey("k".repeat(201)), { code: "SMS_IDEMPOTENCY_KEY_INVALID" });
});

test("solicitud de envío: valida módulo, tipo, teléfono, texto y reintentos", () => {
  const ok = prepareSendRequest({ module: "DIAGNOSTIC", messageType: "TEST", phone: "9 6651 4044", body: "Hola", idempotencyKey: "diag:0001", metadata: { token: "x", a: 1 } });
  assert.equal(ok.phone, "+56966514044");
  assert.deepEqual(ok.metadata, { a: 1 });
  assert.throws(() => prepareSendRequest({ ...ok, module: "X" }), { code: "SMS_MODULE_INVALID" });
  assert.throws(() => prepareSendRequest({ module: "ADMIN", messageType: "bad type", phone: ok.phone, body: "x", idempotencyKey: "abcdefgh" }), { code: "SMS_MESSAGE_TYPE_INVALID" });
  assert.throws(() => prepareSendRequest({ module: "ADMIN", messageType: "T", phone: "22222", body: "x", idempotencyKey: "abcdefgh" }), { code: "SMS_PHONE_INVALID" });
  assert.throws(() => prepareSendRequest({ module: "ADMIN", messageType: "T", phone: ok.phone, body: "", idempotencyKey: "abcdefgh" }), { code: "SMS_BODY_EMPTY" });
  assert.throws(() => prepareSendRequest({ module: "ADMIN", messageType: "T", phone: ok.phone, body: "x", idempotencyKey: "abcdefgh", maxAttempts: 9 }), { code: "SMS_MAX_ATTEMPTS_INVALID" });
});
