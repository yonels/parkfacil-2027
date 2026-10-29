import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  cancelSmsCentral,
  checkCentralDeliveries,
  processDueSms,
  resendSmsCentral,
  resolveCenterSmsProvider,
  sendSmsCentral,
} from "./smsCenterServiceCore.mjs";
import { simulatedSmsProvider } from "../onStreetSmsProviderCore.mjs";

// Base en memoria que reproduce la semántica de las funciones SQL
// (sms_enqueue_message, sms_transition, sms_claim_due) de la migración
// 20261029212053_sms_control_center.sql, que además se prueba contra
// Postgres real en supabase/tests/sms_control_center.test.sql.
function makeDb({ settings = {} } = {}) {
  const messages = [];
  const events = [];
  const audit = [];
  const conf = { rate_limit_phone_per_hour: 5, rate_limit_user_per_hour: 20, rate_limit_company_per_hour: 500, auto_retry_delays_seconds: [60, 300, 900], ...settings };
  let seq = 0;
  const ALLOWED = ["provider", "is_simulated", "provider_message_id", "provider_code", "provider_description", "error_code", "error_category", "attempts", "next_retry_at", "sent_at", "accepted_at", "delivered_at", "failed_at", "status_checks", "last_status_check_at"];

  function addEvent(row) {
    if (events.some((e) => e.message_id === row.message_id && e.dedupe_key === row.dedupe_key)) return false;
    events.push(row);
    return true;
  }
  const rpcs = {
    sms_enqueue_message({ p }) {
      const existing = messages.find((m) => m.idempotency_key === p.idempotency_key);
      if (existing) return { reused: true, message: { ...existing } };
      if (!p.skip_rate_limits) {
        if (messages.filter((m) => m.phone_normalized === p.phone_normalized).length >= conf.rate_limit_phone_per_hour) return { error: "RATE_LIMITED", scope: "PHONE", limit: conf.rate_limit_phone_per_hour };
        if (p.origin_user_id && messages.filter((m) => m.origin_user_id === p.origin_user_id).length >= conf.rate_limit_user_per_hour) return { error: "RATE_LIMITED", scope: "USER", limit: conf.rate_limit_user_per_hour };
      }
      const parent = p.parent_message_id ? messages.find((m) => m.id === p.parent_message_id) : null;
      const id = `m${++seq}`;
      const row = { id, module: p.module, message_type: p.message_type, company_id: p.company_id, parking_id: p.parking_id, origin_user_id: p.origin_user_id,
        phone_normalized: p.phone_normalized, body: p.body, status: "QUEUED", provider: p.provider, is_simulated: p.is_simulated, idempotency_key: p.idempotency_key,
        parent_message_id: p.parent_message_id || null, root_message_id: parent ? parent.root_message_id : id, max_attempts: p.max_attempts, attempts: 0, status_checks: 0, next_retry_at: null };
      messages.push(row);
      addEvent({ message_id: id, from_status: null, to_status: "QUEUED", source: p.event_source, dedupe_key: "enqueue" });
      return { reused: false, message: { ...row } };
    },
    sms_transition({ p_message_id, p_expected, p_to, p_patch, p_event }) {
      const row = messages.find((m) => m.id === p_message_id);
      if (!row) return { error: "NOT_FOUND" };
      if (!p_expected.includes(row.status)) return { error: "STATUS_CONFLICT", status: row.status };
      const from = row.status;
      for (const [key, value] of Object.entries(p_patch || {})) if (ALLOWED.includes(key)) row[key] = value;
      row.status = p_to;
      const recorded = addEvent({ message_id: row.id, from_status: from, to_status: p_to, ...p_event });
      return { message: { ...row }, event_recorded: recorded };
    },
    sms_claim_due({ p_limit }) {
      const now = Date.now();
      const due = messages.filter((m) => m.status === "QUEUED" && (!m.next_retry_at || Date.parse(m.next_retry_at) <= now)).slice(0, p_limit);
      for (const m of due) { m.status = "SENDING"; addEvent({ message_id: m.id, from_status: "QUEUED", to_status: "SENDING", source: "SYSTEM", dedupe_key: `claim:${m.attempts}` }); }
      return due.map((m) => ({ ...m }));
    },
  };
  function query(table) {
    const filters = [];
    let limitN = null;
    const source = table === "sms_messages" ? messages : table === "sms_settings" ? [{ id: true, ...conf }] : [];
    const api = {
      select() { return api; },
      eq(col, val) { filters.push((r) => r[col] === val); return api; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return api; },
      not(col) { filters.push((r) => r[col] != null); return api; },
      order() { return api; },
      limit(n) { limitN = n; return api; },
      async maybeSingle() { const row = source.find((r) => filters.every((f) => f(r))); return { data: row ? { ...row } : null, error: null }; },
      async insert(row) { if (table === "sms_admin_audit") audit.push(row); return { error: null }; },
      then(resolve) {
        let rows = source.filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r }));
        if (limitN != null) rows = rows.slice(0, limitN);
        resolve({ data: rows, error: null });
      },
    };
    return api;
  }
  return {
    messages, events, audit,
    async rpc(name, args) { return { data: rpcs[name](args), error: null }; },
    from: query,
  };
}

function scriptedProvider(steps, { name = "SENTRALAND", statuses = [] } = {}) {
  const calls = [];
  return {
    name,
    calls,
    async send(args) {
      calls.push(args);
      const step = steps.shift();
      if (step instanceof Error) throw step;
      return step;
    },
    async checkStatus({ providerMessageId }) {
      const next = statuses.shift();
      if (next instanceof Error) throw next;
      return { ...next, providerMessageId };
    },
  };
}

const base = { module: "DIAGNOSTIC", messageType: "TEST", phone: "+56966514044", body: "ParkFacil: prueba", idempotencyKey: "diag:test-0001" };

test("envío simulado: queda ACEPTADO marcado como simulado, nunca como entrega real", async () => {
  const db = makeDb();
  const result = await sendSmsCentral(base, { db, provider: simulatedSmsProvider });
  assert.equal(result.message.status, "ACCEPTED");
  assert.equal(result.message.is_simulated, true);
  assert.equal(result.message.provider, "SIMULATED");
  assert.match(result.message.provider_message_id, /^simulated-/);
  assert.deepEqual(db.events.map((e) => e.to_status), ["QUEUED", "SENDING", "ACCEPTED"]);
});

test("misma clave de idempotencia: un solo envío al proveedor", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: true, providerMessageId: "S1", providerStatus: "0" }]);
  await sendSmsCentral(base, { db, provider });
  const again = await sendSmsCentral(base, { db, provider });
  assert.equal(again.reused, true);
  assert.equal(provider.calls.length, 1);
  assert.equal(db.messages.length, 1);
});

test("envíos concurrentes con la misma clave: un solo SMS", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: true, providerMessageId: "S1", providerStatus: "0" }, { ok: true, providerMessageId: "S2", providerStatus: "0" }]);
  await Promise.all([sendSmsCentral(base, { db, provider }), sendSmsCentral(base, { db, provider })]);
  assert.equal(provider.calls.length, 1);
});

test("Sentraland acepta: guarda idmensaje y queda ACEPTADO, no entregado", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: true, providerMessageId: "SENTR123", providerStatus: "0", providerDescription: "Ok mensaje enviado" }]);
  const { message } = await sendSmsCentral(base, { db, provider });
  assert.equal(message.status, "ACCEPTED");
  assert.equal(message.provider_message_id, "SENTR123");
  assert.equal(message.delivered_at, undefined);
  assert.equal(message.is_simulated, false);
});

test("sin saldo (codigo 2): rechazado, sin reintento", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: false, providerStatus: "2", providerDescription: "ERROR SIN SMS EN BOLSA", errorCode: "SENTRALAND_2" }]);
  const { message } = await sendSmsCentral({ ...base, maxAttempts: 3 }, { db, provider });
  assert.equal(message.status, "REJECTED");
  assert.equal(message.error_category, "NO_BALANCE");
  assert.equal(message.next_retry_at, null);
});

test("contingencia (codigo 7): vuelve a la cola con espera y se reintenta hasta el máximo", async () => {
  const db = makeDb({ settings: { auto_retry_delays_seconds: [0, 0] } });
  const fail = () => ({ ok: false, providerStatus: "7", errorCode: "SENTRALAND_7" });
  const provider = scriptedProvider([fail(), fail(), fail()]);
  const first = await sendSmsCentral({ ...base, maxAttempts: 3 }, { db, provider });
  assert.equal(first.message.status, "QUEUED");
  assert.equal(first.message.attempts, 1);
  assert.ok(first.message.next_retry_at);
  await processDueSms({ db, provider });
  const [after2] = db.messages;
  assert.equal(after2.status, "QUEUED");
  assert.equal(after2.attempts, 2);
  await processDueSms({ db, provider });
  assert.equal(db.messages[0].status, "FAILED");
  assert.equal(db.messages[0].attempts, 3);
  assert.equal(provider.calls.length, 3);
  await processDueSms({ db, provider });
  assert.equal(provider.calls.length, 3, "nunca supera el máximo");
  assert.deepEqual(db.events.filter((e) => e.source === "RETRY").length, 2);
});

test("la espera progresiva respeta next_retry_at (no reintenta antes)", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: false, providerStatus: "9", errorCode: "SENTRALAND_9" }]);
  await sendSmsCentral({ ...base, maxAttempts: 3 }, { db, provider });
  const processed = await processDueSms({ db, provider });
  assert.equal(processed.length, 0);
  assert.equal(provider.calls.length, 1);
});

test("timeout durante el envío real: estado desconocido y SIN reintento automático", async () => {
  const db = makeDb();
  const provider = resolveCenterSmsProvider("sentraland", {
    getToken: async () => "tok",
    sendSms: async () => { throw Object.assign(new Error("SENTRALAND_TIMEOUT"), { code: "SENTRALAND_TIMEOUT", retryable: true }); },
  });
  const { message } = await sendSmsCentral({ ...base, maxAttempts: 3 }, { db, provider });
  assert.equal(message.status, "UNKNOWN");
  assert.equal(message.next_retry_at, null);
});

test("timeout al pedir el token: fallido reintentable (el SMS no salió)", async () => {
  const db = makeDb();
  let sendCalls = 0;
  const provider = resolveCenterSmsProvider("sentraland", {
    getToken: async () => { throw Object.assign(new Error("SENTRALAND_TIMEOUT"), { code: "SENTRALAND_TIMEOUT" }); },
    sendSms: async () => { sendCalls += 1; return { ok: true }; },
  });
  const { message } = await sendSmsCentral({ ...base, maxAttempts: 2 }, { db, provider });
  assert.equal(message.status, "QUEUED");
  assert.equal(message.error_category, "CONNECTIVITY");
  assert.equal(sendCalls, 0);
});

test("adaptador Sentraland del centro reutiliza el existente y traduce la respuesta", async () => {
  const db = makeDb();
  const provider = resolveCenterSmsProvider("sentraland", {
    getToken: async () => "tok",
    sendSms: async ({ fono, mensaje, token }) => {
      assert.deepEqual([fono, mensaje, token], ["+56966514044", "ParkFacil: prueba", "tok"]);
      return { ok: true, code: 0, description: "Ok mensaje enviado", idmensaje: "SENTR9" };
    },
  });
  assert.equal(provider.name, "SENTRALAND");
  const { message } = await sendSmsCentral(base, { db, provider });
  assert.equal(message.provider_message_id, "SENTR9");
  assert.equal(message.status, "ACCEPTED");
});

test("límite de frecuencia por teléfono", async () => {
  const db = makeDb({ settings: { rate_limit_phone_per_hour: 2 } });
  await sendSmsCentral({ ...base, idempotencyKey: "rate:0001" }, { db, provider: simulatedSmsProvider });
  await sendSmsCentral({ ...base, idempotencyKey: "rate:0002" }, { db, provider: simulatedSmsProvider });
  await assert.rejects(sendSmsCentral({ ...base, idempotencyKey: "rate:0003" }, { db, provider: simulatedSmsProvider }), { code: "SMS_RATE_LIMITED", status: 429, scope: "PHONE" });
});

test("teléfono inválido: se rechaza antes de tocar base o proveedor", async () => {
  const db = makeDb();
  const provider = scriptedProvider([]);
  await assert.rejects(sendSmsCentral({ ...base, phone: "+56226514044" }, { db, provider }), { code: "SMS_PHONE_INVALID" });
  assert.equal(db.messages.length, 0);
  assert.equal(provider.calls.length, 0);
});

test("DLR: aceptado -> pendiente -> entregado; lecturas repetidas no duplican eventos", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: true, providerMessageId: "SENTR1", providerStatus: "0" }], {
    statuses: [
      { deliveryState: "ACCEPTED", providerStatus: "0", providerDescription: "ENROUTE" },
      { deliveryState: "ACCEPTED", providerStatus: "0", providerDescription: "ENROUTE" },
      new Error("timeout"),
      { deliveryState: "DELIVERED", providerStatus: "0", providerDescription: "DELIVRD" },
    ],
  });
  await sendSmsCentral(base, { db, provider });
  await checkCentralDeliveries({ db, provider });
  assert.equal(db.messages[0].status, "PENDING_CONFIRMATION");
  await checkCentralDeliveries({ db, provider });
  assert.equal(db.events.filter((e) => e.source === "DLR_POLL").length, 1, "mismo resultado leído dos veces = un evento");
  assert.equal(db.messages[0].status_checks, 2);
  await checkCentralDeliveries({ db, provider });
  assert.equal(db.messages[0].status, "PENDING_CONFIRMATION", "un error de consulta no cambia el estado");
  await checkCentralDeliveries({ db, provider });
  assert.equal(db.messages[0].status, "DELIVERED");
  assert.ok(db.messages[0].delivered_at);
});

test("DLR: los simulados no se consultan", async () => {
  const db = makeDb();
  await sendSmsCentral(base, { db, provider: simulatedSmsProvider });
  const provider = scriptedProvider([], { statuses: [{ deliveryState: "DELIVERED" }] });
  assert.deepEqual(await checkCentralDeliveries({ db, provider }), []);
});

test("reenvío manual: requiere confirmación, audita y crea un hijo idempotente", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: false, providerStatus: "1", errorCode: "SENTRALAND_1" }, { ok: true, providerMessageId: "S2", providerStatus: "0" }]);
  const { message } = await sendSmsCentral(base, { db, provider });
  assert.equal(message.status, "REJECTED");
  await assert.rejects(resendSmsCentral({ messageId: message.id, requestId: "req-0001", actorUserId: "u1" }, { db, provider }), { code: "SMS_CONFIRMATION_REQUIRED" });
  const resent = await resendSmsCentral({ messageId: message.id, requestId: "req-0001", actorUserId: "u1", confirmed: true }, { db, provider });
  assert.equal(resent.message.status, "ACCEPTED");
  assert.equal(resent.message.parent_message_id, message.id);
  assert.equal(resent.message.root_message_id, message.id);
  const doubleClick = await resendSmsCentral({ messageId: message.id, requestId: "req-0001", actorUserId: "u1", confirmed: true }, { db, provider });
  assert.equal(doubleClick.reused, true);
  assert.equal(provider.calls.length, 2);
  assert.equal(db.audit.filter((a) => a.action === "MANUAL_RESEND").length, 2);
});

test("reenvío de un entregado o de un desconocido sin aceptar el riesgo: rechazado", async () => {
  const db = makeDb();
  const provider = scriptedProvider([{ ok: true, providerMessageId: "S1", providerStatus: "0" }]);
  const { message } = await sendSmsCentral(base, { db, provider });
  await assert.rejects(resendSmsCentral({ messageId: message.id, requestId: "req-0002", confirmed: true }, { db, provider }), { code: "SMS_RESEND_STATUS_NOT_RESENDABLE" });
  db.messages[0].status = "UNKNOWN";
  await assert.rejects(resendSmsCentral({ messageId: message.id, requestId: "req-0003", confirmed: true }, { db, provider }), { code: "SMS_RESEND_DUPLICATE_RISK_NOT_ACKNOWLEDGED" });
});

test("cancelar: solo en cola; un enviado no se cancela", async () => {
  const db = makeDb();
  const queued = await sendSmsCentral({ ...base, idempotencyKey: "cancel:0001" }, { db, provider: simulatedSmsProvider, send: false });
  const cancelled = await cancelSmsCentral({ messageId: queued.message.id, actorUserId: "u1", reason: "prueba" }, { db });
  assert.equal(cancelled.status, "CANCELLED");
  const sent = await sendSmsCentral({ ...base, idempotencyKey: "cancel:0002" }, { db, provider: simulatedSmsProvider });
  await assert.rejects(cancelSmsCentral({ messageId: sent.message.id }, { db }), { code: "SMS_CANCEL_NOT_ALLOWED" });
});

test("la respuesta técnica guardada en eventos nunca incluye credenciales", async () => {
  const db = makeDb();
  const error = Object.assign(new Error("SENTRALAND_TOKEN_ERROR"), { code: "SENTRALAND_TOKEN_ERROR", providerCode: 1, providerDescription: "credenciales" });
  const provider = scriptedProvider([error]);
  await sendSmsCentral(base, { db, provider });
  assert.doesNotMatch(JSON.stringify(db.events), /password|token"|usuario/i);
});

// Compatibilidad On Street / Off Street: la migración y el servicio no tocan nada existente.
const migration = await readFile(new URL("../../../supabase/migrations/20261029212053_sms_control_center.sql", import.meta.url), "utf8");
const serviceSource = await readFile(new URL("./smsCenterServiceCore.mjs", import.meta.url), "utf8");

test("compatibilidad: la migración no altera tablas, triggers ni funciones On Street / Off Street", () => {
  assert.doesNotMatch(migration, /alter\s+table\s+(if\s+exists\s+)?public\.(?!sms_)/i);
  assert.doesNotMatch(migration, /drop\s+(table|trigger|function)/i);
  assert.doesNotMatch(migration, /create\s+(or\s+replace\s+)?trigger/i);
  assert.doesNotMatch(migration, /(update|delete\s+from|insert\s+into)\s+public\.(on_street|parkings|companies|off_street)/i);
  for (const match of migration.matchAll(/create\s+(?:table|or\s+replace\s+(?:function|view))\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)/gi)) {
    assert.match(match[1], /^sms_/, match[1]);
  }
});

test("compatibilidad: el servicio central no escribe en las tablas heredadas", () => {
  assert.doesNotMatch(serviceSource, /on_street_pilot_notifications|on_street_inspections/);
});

test("compatibilidad: sin SMS_PROVIDER el centro usa el simulado (igual que On Street)", () => {
  const previous = process.env.SMS_PROVIDER;
  delete process.env.SMS_PROVIDER;
  try { assert.equal(resolveCenterSmsProvider().name, "SIMULATED"); }
  finally { if (previous !== undefined) process.env.SMS_PROVIDER = previous; }
});
