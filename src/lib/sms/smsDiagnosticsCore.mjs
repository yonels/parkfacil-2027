// Diagnóstico y envío de prueba del Centro de Control SMS
// (SOL-2026-10-29-007). Núcleo con dependencias inyectadas: en pruebas
// automatizadas nunca toca Sentraland ni credenciales reales.
//
// Reglas del envío de prueba (instrucciones §10): nunca automático, solo con
// confirmación explícita, un único SMS por operación (idempotencia por
// requestId), número en la lista autorizada, espera mínima entre pruebas
// del mismo usuario, respuesta real del proveedor visible y registro en el
// historial general (módulo DIAGNOSTIC). Un envío simulado se rotula como tal.
import { sentralandGetToken, sentralandQueryBalance } from "./sentralandCore.mjs";
import { normalizeChileanMobile, sanitizeProviderDetail } from "./smsCenterCore.mjs";
import { providerConfigStatus, SMS_TEST_TEXT } from "./smsAdminCore.mjs";
import { sendSmsCentral } from "./smsCenterServiceCore.mjs";

function codeError(code, status, extra = {}) {
  return Object.assign(new Error(code), { code, status, ...extra });
}

// Ejecuta el diagnóstico. En modo simulado no llama a la red. En modo real
// solo pide un token y consulta la bolsa: NUNCA envía un SMS.
export async function runProviderDiagnostic({ env = process.env, getToken = sentralandGetToken, queryBalance = sentralandQueryBalance, now = () => Date.now() } = {}) {
  const config = providerConfigStatus(env);
  const started = now();
  const result = { provider: config.provider, mode: config.mode, config_ok: config.configOk, missing_vars: config.missingVars, auth_ok: null, connectivity_ok: null, balance: null, error_code: null, provider_code: null, provider_description: null };
  if (config.mode !== "REAL" || !config.configOk) {
    if (config.provider === "DESCONOCIDO") result.error_code = "SMS_PROVIDER_UNKNOWN";
    else if (!config.configOk) result.error_code = "SENTRALAND_NOT_CONFIGURED";
    return { ...result, duration_ms: now() - started, config };
  }
  try {
    await getToken();
    result.auth_ok = true;
    result.connectivity_ok = true;
  } catch (error) {
    result.error_code = error?.code || "SENTRALAND_ERROR";
    result.provider_code = error?.providerCode != null ? String(error.providerCode) : null;
    result.provider_description = error?.providerDescription ?? null;
    if (String(result.error_code).startsWith("SENTRALAND_TOKEN")) { result.auth_ok = false; result.connectivity_ok = true; }
    else if (result.error_code === "SENTRALAND_HTTP_ERROR" && [401, 403].includes(error?.status)) { result.auth_ok = false; result.connectivity_ok = true; }
    else { result.connectivity_ok = false; }
    return { ...result, duration_ms: now() - started, config };
  }
  try {
    const balance = await queryBalance();
    result.balance = sanitizeProviderDetail(balance);
    if (!balance.ok) { result.provider_code = String(balance.code); result.provider_description = balance.description ?? null; }
  } catch (error) {
    result.balance = { ok: false, error: error?.code || "SENTRALAND_BALANCE_ERROR" };
  }
  return { ...result, duration_ms: now() - started, config };
}

export async function sendTestSms({ phone, requestId, actorUserId, confirmed }, { db, provider, settings, now = () => new Date() }) {
  if (confirmed !== true) throw codeError("SMS_CONFIRMATION_REQUIRED", 400);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(requestId || ""))) throw codeError("SMS_REQUEST_ID_INVALID", 400);
  if (!actorUserId) throw codeError("SMS_ACTOR_REQUIRED", 401);
  const normalized = normalizeChileanMobile(phone);
  if (!normalized) throw codeError("SMS_PHONE_INVALID", 400);
  const allowed = (settings?.test_allowed_phones || []).map((p) => normalizeChileanMobile(p)).filter(Boolean);
  if (!allowed.includes(normalized)) throw codeError("SMS_TEST_PHONE_NOT_AUTHORIZED", 403);

  const idempotencyKey = `test:${actorUserId}:${requestId}`;
  const { data: existing, error: existingError } = await db.from("sms_messages").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingError) throw codeError("SMS_DB_ERROR", 500);
  if (!existing) {
    const cooldown = Number(settings?.test_send_cooldown_seconds || 60);
    const since = new Date(now().getTime() - cooldown * 1000).toISOString();
    const { data: recent, error: recentError } = await db.from("sms_messages").select("id,created_at")
      .eq("module", "DIAGNOSTIC").eq("origin_user_id", actorUserId).gte("created_at", since).limit(1);
    if (recentError) throw codeError("SMS_DB_ERROR", 500);
    if (recent?.length) throw codeError("SMS_TEST_COOLDOWN", 429, { retryAfterSeconds: cooldown });
  }

  const { error: auditError } = await db.from("sms_admin_audit").insert({
    actor_user_id: actorUserId, action: "TEST_SEND", target_type: "phone", target_id: `****${normalized.slice(-4)}`,
    detail: { requestId, provider: provider.name, simulated: provider.name === "SIMULATED", reused: Boolean(existing) },
  });
  if (auditError) throw codeError("SMS_AUDIT_FAILED", 500);

  const result = await sendSmsCentral({
    module: "DIAGNOSTIC", messageType: "TEST", phone: normalized, body: SMS_TEST_TEXT,
    originUserId: actorUserId, idempotencyKey, eventSource: "DIAGNOSTIC", metadata: { requestId },
  }, { db, provider, now });
  const m = result.message;
  return {
    reused: result.reused,
    simulated: Boolean(m.is_simulated),
    message: {
      id: m.id, status: m.status, providerMessageId: m.provider_message_id ?? null, providerCode: m.provider_code ?? null,
      providerDescription: m.provider_description ?? null, errorCode: m.error_code ?? null, errorCategory: m.error_category ?? null,
      createdAt: m.created_at ?? null, acceptedAt: m.accepted_at ?? null, phone: `+56 9 ****${normalized.slice(-4)}`,
    },
  };
}
