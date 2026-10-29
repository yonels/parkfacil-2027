import test from "node:test";
import assert from "node:assert/strict";
import { exportColumns, prepareResendFromHistory, providerConfigStatus, SMS_TEST_TEXT, shapeSmsSettings, validateSmsSettings, validateTariff } from "./smsAdminCore.mjs";
import { runProviderDiagnostic, sendTestSms } from "./smsDiagnosticsCore.mjs";
import { simulatedSmsProvider } from "../onStreetSmsProviderCore.mjs";
import { INSPECTION_OVERDUE_SMS_TEXT } from "../inspector/inspectorSms.mjs";

const validSettings = { retentionDays: "365", rateLimitUserPerHour: "20", rateLimitCompanyPerHour: "500", rateLimitPhonePerHour: "5", testSendCooldownSeconds: "60", testAllowedPhones: "+56966514044\n9 1234 5678", autoRetryMax: "3", autoRetryDelaysSeconds: "60, 300, 900", unconfirmedAfterHours: "24" };

test("configuración: normaliza números y valida rangos", () => {
  const values = validateSmsSettings(validSettings);
  assert.deepEqual(values.test_allowed_phones, ["+56966514044", "+56912345678"]);
  assert.deepEqual(values.auto_retry_delays_seconds, [60, 300, 900]);
  assert.equal(values.retention_days, 365);
  assert.equal("inbound_enabled" in values, false, "la recepción no se edita desde aquí");
  for (const [field, value] of [["retentionDays", "10"], ["rateLimitPhonePerHour", "0"], ["autoRetryMax", "9"], ["testAllowedPhones", "+56226514044"], ["testAllowedPhones", ""], ["autoRetryDelaysSeconds", "300, 60"], ["autoRetryDelaysSeconds", "5"]]) {
    assert.throws(() => validateSmsSettings({ ...validSettings, [field]: value }), (e) => e.code === "SMS_VALIDATION_ERROR" && e.field === field, `${field}=${value}`);
  }
  assert.equal(shapeSmsSettings({ inbound_enabled: false, test_allowed_phones: ["+56966514044"] }).inboundEnabled, false);
});

test("tarifas: solo internas, valores y fechas válidos", () => {
  const t = validateTariff({ unitPrice: "12,5", currency: "CLP", validFrom: "2026-10-01" });
  assert.deepEqual([t.unit_price, t.source, t.company_id, t.valid_to], [12.5, "INTERNAL", null, null]);
  assert.throws(() => validateTariff({ unitPrice: "-1", validFrom: "2026-10-01" }), { field: "unitPrice" });
  assert.throws(() => validateTariff({ unitPrice: "1", currency: "EUR", validFrom: "2026-10-01" }), { field: "currency" });
  assert.throws(() => validateTariff({ unitPrice: "1", validFrom: "2026-10-10", validTo: "2026-10-01" }), { field: "validTo" });
  assert.throws(() => validateTariff({ unitPrice: "1", validFrom: "ayer" }), { field: "validFrom" });
});

const base = { source: "ON_STREET_NOTIFICATION", source_id: "11111111-2222-4333-8444-555555555555", message_id: null, module: "ON_STREET", message_type: "ON_STREET_EXPIRING_SOON", company_id: "c1", parking_id: "p1", phone_normalized: "+56966514044", body: "Aviso", status: "FAILED", error_category: "TEMPORARY" };

test("reenvío desde historial: heredado crea un mensaje central nuevo enlazado", () => {
  const r = prepareResendFromHistory(base);
  assert.equal(r.ok, true);
  assert.equal(r.request.parentMessageId, null);
  assert.deepEqual(r.request.metadata, { resendOf: { source: "ON_STREET_NOTIFICATION", id: base.source_id } });
  const central = prepareResendFromHistory({ ...base, source: "CENTRAL", message_id: "m1" });
  assert.equal(central.request.parentMessageId, "m1");
  const inspection = prepareResendFromHistory({ ...base, source: "ON_STREET_INSPECTION", message_type: "INSPECTION_OVERDUE", body: null });
  assert.equal(inspection.request.body, INSPECTION_OVERDUE_SMS_TEXT);
});

test("reenvío desde historial: casos no reenviables", () => {
  assert.equal(prepareResendFromHistory({ ...base, phone_normalized: null }).code, "PHONE_NOT_STORED");
  assert.equal(prepareResendFromHistory({ ...base, body: null }).code, "BODY_NOT_STORED");
  assert.equal(prepareResendFromHistory({ ...base, status: "DELIVERED" }).code, "STATUS_NOT_RESENDABLE");
  assert.equal(prepareResendFromHistory({ ...base, status: "UNKNOWN" }).code, "DUPLICATE_RISK_NOT_ACKNOWLEDGED");
  assert.equal(prepareResendFromHistory({ ...base, status: "UNKNOWN" }, { acknowledgeDuplicateRisk: true }).duplicateRisk, true);
});

test("exportación: teléfono enmascarado siempre; contenido solo si se pide", () => {
  assert.equal(exportColumns().some((c) => c.key === "body"), false);
  assert.equal(exportColumns({ includeContent: true }).some((c) => c.key === "body"), true);
  assert.equal(exportColumns().find((c) => c.key === "phone").label, "Teléfono (enmascarado)");
});

test("estado del proveedor: nunca expone valores de credenciales", () => {
  const secret = "S3cr3t-Value";
  const status = providerConfigStatus({ SMS_PROVIDER: "sentraland", SENTRALAND_INSTITUCION: "inst", SENTRALAND_TIPO_SERVICIO: "1", SENTRALAND_USUARIO: "user", SENTRALAND_PASSWORD: secret });
  assert.equal(status.mode, "REAL");
  assert.equal(status.configOk, true);
  assert.doesNotMatch(JSON.stringify(status), /S3cr3t|inst"|"user"/);
  const missing = providerConfigStatus({ SMS_PROVIDER: "sentraland" });
  assert.deepEqual(missing.missingVars, ["SENTRALAND_INSTITUCION", "SENTRALAND_TIPO_SERVICIO", "SENTRALAND_USUARIO", "SENTRALAND_PASSWORD"]);
  const simulated = providerConfigStatus({});
  assert.deepEqual([simulated.provider, simulated.mode, simulated.providerDefaulted], ["SIMULATED", "SIMULATED", true]);
  assert.equal(providerConfigStatus({ SMS_PROVIDER: "sentraland", SENTRALAND_PASSWORD: ' "x" ' }).vars.find((v) => v.name === "SENTRALAND_PASSWORD").clean, false);
});

test("diagnóstico simulado: no llama a la red", async () => {
  let calls = 0;
  const r = await runProviderDiagnostic({ env: {}, getToken: async () => { calls += 1; }, queryBalance: async () => { calls += 1; } });
  assert.equal(calls, 0);
  assert.deepEqual([r.mode, r.auth_ok, r.connectivity_ok], ["SIMULATED", null, null]);
});

const realEnv = { SMS_PROVIDER: "sentraland", SENTRALAND_INSTITUCION: "a", SENTRALAND_TIPO_SERVICIO: "1", SENTRALAND_USUARIO: "b", SENTRALAND_PASSWORD: "c" };

test("diagnóstico real (mock): token + bolsa, sin enviar SMS", async () => {
  const r = await runProviderDiagnostic({ env: realEnv, getToken: async () => "tok", queryBalance: async () => ({ ok: true, code: 0, bags: [{ saldo: 120, cantidad: 1000 }] }) });
  assert.deepEqual([r.auth_ok, r.connectivity_ok], [true, true]);
  assert.equal(r.balance.bags[0].saldo, 120);
  const auth = await runProviderDiagnostic({ env: realEnv, getToken: async () => { throw Object.assign(new Error("x"), { code: "SENTRALAND_TOKEN_ERROR", providerCode: 1 }); } });
  assert.deepEqual([auth.auth_ok, auth.connectivity_ok, auth.error_code], [false, true, "SENTRALAND_TOKEN_ERROR"]);
  const net = await runProviderDiagnostic({ env: realEnv, getToken: async () => { throw Object.assign(new Error("x"), { code: "SENTRALAND_TIMEOUT" }); } });
  assert.deepEqual([net.auth_ok, net.connectivity_ok], [null, false]);
  const incomplete = await runProviderDiagnostic({ env: { SMS_PROVIDER: "sentraland" }, getToken: async () => { throw new Error("no debe llamarse"); } });
  assert.equal(incomplete.error_code, "SENTRALAND_NOT_CONFIGURED");
});

// Base mínima en memoria para el envío de prueba.
function makeDb() {
  const messages = [];
  const audit = [];
  let seq = 0;
  const query = (table) => {
    const filters = [];
    const api = {
      select() { return api; }, order() { return api; }, limit() { return api; },
      eq(c, v) { filters.push((r) => r[c] === v); return api; },
      gte(c, v) { filters.push((r) => r[c] >= v); return api; },
      in(c, v) { filters.push((r) => v.includes(r[c])); return api; },
      not(c) { filters.push((r) => r[c] != null); return api; },
      async maybeSingle() { return { data: (table === "sms_messages" ? messages : []).find((r) => filters.every((f) => f(r))) || null, error: null }; },
      async insert(row) { audit.push(row); return { error: null }; },
      then(resolve) { resolve({ data: (table === "sms_messages" ? messages : []).filter((r) => filters.every((f) => f(r))), error: null }); },
    };
    return api;
  };
  return {
    messages, audit, from: query,
    async rpc(name, args) {
      if (name === "sms_enqueue_message") {
        const p = args.p;
        const existing = messages.find((m) => m.idempotency_key === p.idempotency_key);
        if (existing) return { data: { reused: true, message: existing }, error: null };
        const row = { id: `m${++seq}`, ...p, status: "QUEUED", attempts: 0, created_at: new Date().toISOString(), phone_last4: p.phone_normalized.slice(-4) };
        messages.push(row);
        return { data: { reused: false, message: row }, error: null };
      }
      if (name === "sms_transition") {
        const row = messages.find((m) => m.id === args.p_message_id);
        if (!args.p_expected.includes(row.status)) return { data: { error: "STATUS_CONFLICT" }, error: null };
        Object.assign(row, args.p_patch, { status: args.p_to });
        return { data: { message: { ...row } }, error: null };
      }
      throw new Error(name);
    },
  };
}

const settings = { test_allowed_phones: ["+56966514044"], test_send_cooldown_seconds: 60 };
const input = { phone: "+56966514044", requestId: "req-00000001", actorUserId: "root-1", confirmed: true };

test("prueba: exige confirmación, número autorizado y requestId", async () => {
  const db = makeDb();
  await assert.rejects(sendTestSms({ ...input, confirmed: false }, { db, provider: simulatedSmsProvider, settings }), { code: "SMS_CONFIRMATION_REQUIRED" });
  await assert.rejects(sendTestSms({ ...input, phone: "+56911111111" }, { db, provider: simulatedSmsProvider, settings }), { code: "SMS_TEST_PHONE_NOT_AUTHORIZED", status: 403 });
  await assert.rejects(sendTestSms({ ...input, phone: "123" }, { db, provider: simulatedSmsProvider, settings }), { code: "SMS_PHONE_INVALID" });
  await assert.rejects(sendTestSms({ ...input, requestId: "x" }, { db, provider: simulatedSmsProvider, settings }), { code: "SMS_REQUEST_ID_INVALID" });
  assert.equal(db.messages.length, 0);
});

test("prueba simulada: un solo SMS, rotulado SIMULADO, auditado y con texto fijo", async () => {
  const db = makeDb();
  const r = await sendTestSms(input, { db, provider: simulatedSmsProvider, settings });
  assert.equal(r.simulated, true);
  assert.equal(r.message.status, "ACCEPTED");
  assert.equal(r.message.phone, "+56 9 ****4044");
  assert.equal(db.messages[0].body, SMS_TEST_TEXT);
  assert.equal(db.messages[0].module, "DIAGNOSTIC");
  assert.equal(db.audit[0].action, "TEST_SEND");
  assert.equal(db.audit[0].target_id, "****4044");
  const again = await sendTestSms(input, { db, provider: simulatedSmsProvider, settings });
  assert.equal(again.reused, true, "doble clic con el mismo requestId no envía otro");
  assert.equal(db.messages.length, 1);
});

test("prueba: espera mínima entre pruebas del mismo usuario", async () => {
  const db = makeDb();
  await sendTestSms(input, { db, provider: simulatedSmsProvider, settings });
  await assert.rejects(sendTestSms({ ...input, requestId: "req-00000002" }, { db, provider: simulatedSmsProvider, settings }), { code: "SMS_TEST_COOLDOWN", status: 429 });
});

test("prueba real (mock de Sentraland): devuelve la respuesta real y el idmensaje", async () => {
  const db = makeDb();
  const sent = [];
  const provider = { name: "SENTRALAND", async send(args) { sent.push(args); return { ok: true, providerMessageId: "SENTR42", providerStatus: "0", providerDescription: "Ok mensaje enviado" }; }, checkStatus: async () => ({}) };
  const r = await sendTestSms(input, { db, provider, settings });
  assert.equal(r.simulated, false);
  assert.deepEqual([r.message.providerMessageId, r.message.providerCode, r.message.providerDescription], ["SENTR42", "0", "Ok mensaje enviado"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message, SMS_TEST_TEXT);
});
