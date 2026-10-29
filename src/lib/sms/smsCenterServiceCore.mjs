// Servicio SMS centralizado (SOL-2026-10-29-007) — núcleo con dependencias
// inyectadas (db tipo Supabase, proveedor con el contrato de
// onStreetSmsProviderCore: { name, send, checkStatus }). Sin "server-only":
// el punto de entrada para la app es smsCenterService.js.
//
// No reemplaza ni modifica el envío On Street / Inspector existente: es la
// vía para los módulos nuevos (diagnóstico, reenvíos, Mesa de Ayuda,
// alertas, Off Street). Todas las escrituras de estado pasan por las
// funciones atómicas sms_enqueue_message / sms_transition / sms_claim_due.
import { createSentralandSmsProvider, resolveSmsProvider } from "../onStreetSmsProviderCore.mjs";
import { sentralandGetToken, sentralandSendSms, sentralandQueryStatus } from "./sentralandCore.mjs";
import {
  AWAITING_DELIVERY_STATUSES,
  classifySendOutcome,
  nextRetryDelaySeconds,
  prepareSendRequest,
  resendEligibility,
  sanitizeProviderDetail,
  statusFromDeliveryState,
} from "./smsCenterCore.mjs";

function codeError(code, status, extra = {}) {
  return Object.assign(new Error(code), { code, status, ...extra });
}

function withPhase(fn, phase) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (error) {
      if (error && typeof error === "object" && !error.smsPhase) error.smsPhase = phase;
      throw error;
    }
  };
}

// Misma selección de proveedor que On Street (SMS_PROVIDER), pero la
// instancia Sentraland marca en qué fase falló cada intento (TOKEN = el SMS
// seguro no salió; SEND = podría haber salido). Reutiliza el adaptador
// existente; no hay una segunda integración con Sentraland.
export function resolveCenterSmsProvider(name = process.env.SMS_PROVIDER || "simulated", deps = {}) {
  const base = resolveSmsProvider(name);
  if (base.name !== "SENTRALAND") return base;
  return createSentralandSmsProvider({
    getToken: withPhase(deps.getToken || sentralandGetToken, "TOKEN"),
    sendSms: withPhase(deps.sendSms || sentralandSendSms, "SEND"),
    queryStatus: deps.queryStatus || sentralandQueryStatus,
  });
}

async function rpc(db, fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message || "SMS_DB_ERROR"), { code: "SMS_DB_ERROR", cause: error });
  return data;
}

async function transition(db, messageId, expected, to, patch, event) {
  const data = await rpc(db, "sms_transition", {
    p_message_id: messageId,
    p_expected: expected,
    p_to: to,
    p_patch: patch || {},
    p_event: { ...event, detail: sanitizeProviderDetail(event?.detail || {}) },
  });
  return data;
}

async function loadSettings(db) {
  const { data, error } = await db.from("sms_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw Object.assign(new Error("SMS_DB_ERROR"), { code: "SMS_DB_ERROR", cause: error });
  return data || {};
}

// Ejecuta un intento de envío sobre un mensaje ya reclamado (status SENDING).
export async function deliverClaimedMessage({ db, provider, message, settings, now = () => new Date() }) {
  const attempts = Number(message.attempts || 0) + 1;
  const simulated = provider.name === "SIMULATED";
  let result = null;
  let error = null;
  try { result = await provider.send({ to: message.phone_normalized, message: message.body }); }
  catch (cause) { error = cause; }
  const outcome = classifySendOutcome({ result, error });
  const at = now().toISOString();
  const common = {
    provider: provider.name,
    is_simulated: simulated,
    attempts,
    provider_code: outcome.providerCode,
    provider_description: outcome.providerDescription,
  };
  const event = {
    source: message.attempts > 0 ? "RETRY" : "SEND",
    dedupe_key: `attempt:${attempts}`,
    provider_code: outcome.providerCode,
    provider_description: outcome.providerDescription,
    detail: { errorCode: outcome.errorCode, category: outcome.category, simulated },
  };

  if (outcome.status === "ACCEPTED") {
    return transition(db, message.id, ["SENDING"], "ACCEPTED", {
      ...common, provider_message_id: result.providerMessageId || null, sent_at: at, accepted_at: at,
      error_code: null, error_category: null, next_retry_at: null,
    }, event);
  }

  const delay = outcome.retryable
    ? nextRetryDelaySeconds(attempts, { maxAttempts: Number(message.max_attempts || 1), delaysSeconds: settings?.auto_retry_delays_seconds })
    : null;
  if (delay != null) {
    return transition(db, message.id, ["SENDING"], "QUEUED", {
      ...common, error_code: outcome.errorCode, error_category: outcome.category,
      next_retry_at: new Date(now().getTime() + delay * 1000).toISOString(),
    }, { ...event, detail: { ...event.detail, retryInSeconds: delay } });
  }
  return transition(db, message.id, ["SENDING"], outcome.status, {
    ...common, error_code: outcome.errorCode, error_category: outcome.category, next_retry_at: null,
    sent_at: outcome.status === "UNKNOWN" ? at : null, failed_at: outcome.status === "UNKNOWN" ? null : at,
  }, event);
}

// Envío centralizado. Idempotente: la misma idempotencyKey devuelve el
// mismo mensaje sin volver a enviar. send=false solo encola (procesador).
export async function sendSmsCentral(input, { db, provider, send = true, now } = {}) {
  const request = prepareSendRequest(input);
  const enqueued = await rpc(db, "sms_enqueue_message", {
    p: {
      module: request.module,
      message_type: request.messageType,
      company_id: request.companyId,
      parking_id: request.parkingId,
      origin_user_id: request.originUserId,
      phone_normalized: request.phone,
      body: request.body,
      idempotency_key: request.idempotencyKey,
      parent_message_id: request.parentMessageId,
      max_attempts: request.maxAttempts,
      provider: provider.name,
      is_simulated: provider.name === "SIMULATED",
      skip_rate_limits: Boolean(input.skipRateLimits),
      event_source: input.eventSource || "SYSTEM",
      metadata: request.metadata,
    },
  });
  if (enqueued?.error === "RATE_LIMITED") throw codeError("SMS_RATE_LIMITED", 429, { scope: enqueued.scope, limit: enqueued.limit });
  if (enqueued?.error) throw codeError(`SMS_${enqueued.error}`, 409);
  const message = enqueued.message;
  if (enqueued.reused) return { reused: true, message, warnings: request.warnings };
  if (!send) return { reused: false, message, warnings: request.warnings };

  const claimed = await transition(db, message.id, ["QUEUED"], "SENDING", {}, { source: "SYSTEM", dedupe_key: "claim:0" });
  if (claimed?.error) return { reused: false, message, warnings: request.warnings, claimConflict: claimed.error };
  const settings = await loadSettings(db);
  const delivered = await deliverClaimedMessage({ db, provider, message: claimed.message, settings, now });
  return { reused: false, message: delivered?.message || claimed.message, warnings: request.warnings };
}

// Procesador de la cola (reintentos vencidos y mensajes solo encolados).
export async function processDueSms({ db, provider, limit = 50, now } = {}) {
  const claimed = await rpc(db, "sms_claim_due", { p_limit: limit });
  if (!claimed?.length) return [];
  const settings = await loadSettings(db);
  const results = [];
  for (const message of claimed) {
    const done = await deliverClaimedMessage({ db, provider, message, settings, now });
    results.push(done?.message || { id: message.id, error: done?.error });
  }
  return results;
}

// Consulta de entrega (smsstatus) para mensajes aceptados sin confirmación.
// Sentraland no ofrece callbacks: esto es sondeo. Un error de consulta no
// cambia el estado (se reintenta en la próxima corrida). Las lecturas
// repetidas del mismo resultado no duplican eventos (dedupe_key).
export async function checkCentralDeliveries({ db, provider, limit = 50, now = () => new Date(), messageId = null } = {}) {
  if (typeof provider.checkStatus !== "function") return [];
  let pending = db
    .from("sms_messages")
    .select("id,status,provider_message_id,status_checks")
    .in("status", AWAITING_DELIVERY_STATUSES);
  // messageId: consulta puntual (p. ej. el envío de prueba del Diagnóstico).
  if (messageId) pending = pending.eq("id", messageId);
  const { data, error } = await pending
    .eq("is_simulated", false)
    .not("provider_message_id", "is", null)
    .order("last_status_check_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)));
  if (error) throw Object.assign(new Error("SMS_DB_ERROR"), { code: "SMS_DB_ERROR", cause: error });

  const results = [];
  for (const row of data || []) {
    let status;
    try { status = await provider.checkStatus({ providerMessageId: row.provider_message_id }); }
    catch { continue; }
    const to = statusFromDeliveryState(status.deliveryState);
    const at = now().toISOString();
    const patch = {
      provider_code: status.providerStatus ?? null,
      provider_description: status.providerDescription ?? null,
      status_checks: Number(row.status_checks || 0) + 1,
      last_status_check_at: at,
      ...(to === "DELIVERED" ? { delivered_at: at } : {}),
      ...(["FAILED", "REJECTED", "EXPIRED"].includes(to) ? { failed_at: at } : {}),
    };
    const updated = await transition(db, row.id, AWAITING_DELIVERY_STATUSES, to, patch, {
      source: "DLR_POLL",
      dedupe_key: `dlr:${status.providerStatus ?? ""}:${String(status.providerDescription ?? "").toUpperCase()}`,
      provider_code: status.providerStatus ?? null,
      provider_description: status.providerDescription ?? null,
      detail: { deliveryState: status.deliveryState },
    });
    if (updated?.message) results.push(updated.message);
  }
  return results;
}

async function audit(db, entry) {
  const { error } = await db.from("sms_admin_audit").insert({ ...entry, detail: sanitizeProviderDetail(entry.detail || {}) });
  if (error) throw Object.assign(new Error("SMS_AUDIT_FAILED"), { code: "SMS_AUDIT_FAILED", cause: error });
}

// Reenvío manual por un administrador. requestId lo genera el navegador una
// vez por confirmación: un doble clic reutiliza el mismo hijo (idempotencia).
export async function resendSmsCentral({ messageId, requestId, actorUserId, acknowledgeDuplicateRisk = false, confirmed = false }, { db, provider, now } = {}) {
  if (!confirmed) throw codeError("SMS_CONFIRMATION_REQUIRED", 400);
  const { data: row, error } = await db.from("sms_messages").select("*").eq("id", messageId).maybeSingle();
  if (error) throw Object.assign(new Error("SMS_DB_ERROR"), { code: "SMS_DB_ERROR", cause: error });
  const eligibility = resendEligibility(row, { acknowledgeDuplicateRisk });
  if (!eligibility.ok) throw codeError(`SMS_RESEND_${eligibility.code}`, eligibility.code === "NOT_FOUND" ? 404 : 409);
  await audit(db, { actor_user_id: actorUserId, action: "MANUAL_RESEND", target_type: "sms_message", target_id: row.id, detail: { requestId, previousStatus: row.status, duplicateRisk: Boolean(eligibility.duplicateRisk) } });
  return sendSmsCentral({
    module: row.module,
    messageType: row.message_type,
    companyId: row.company_id,
    parkingId: row.parking_id,
    phone: row.phone_normalized,
    body: row.body,
    originUserId: actorUserId,
    parentMessageId: row.id,
    idempotencyKey: `resend:${row.id}:${requestId}`,
    eventSource: "MANUAL",
    metadata: { resendOf: row.id },
  }, { db, provider, now });
}

// Cancela un mensaje que aún no se envía (en cola o esperando reintento).
export async function cancelSmsCentral({ messageId, actorUserId, reason }, { db } = {}) {
  const result = await transition(db, messageId, ["CREATED", "QUEUED"], "CANCELLED", { next_retry_at: null }, {
    source: "MANUAL", dedupe_key: "cancel", actor_user_id: actorUserId, detail: { reason: String(reason || "").slice(0, 200) },
  });
  if (result?.error === "NOT_FOUND") throw codeError("SMS_NOT_FOUND", 404);
  if (result?.error) throw codeError("SMS_CANCEL_NOT_ALLOWED", 409, { currentStatus: result.status });
  await audit(db, { actor_user_id: actorUserId, action: "CANCEL", target_type: "sms_message", target_id: messageId, detail: { reason } });
  return result.message;
}
