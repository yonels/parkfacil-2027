// Núcleo puro del Centro de Control SMS (SOL-2026-10-29-007): estados,
// validación de teléfonos chilenos, clasificación de respuestas de
// Sentraland, política de reintentos y saneamiento. Sin "server-only" ni
// imports "@/..." para poder testearlo en directo con node --test (mismo
// criterio que sentralandCore.mjs / onStreetSmsCore.mjs).

export const SMS_STATUS = Object.freeze({
  CREATED: "CREATED",
  QUEUED: "QUEUED",
  SENDING: "SENDING",
  ACCEPTED: "ACCEPTED",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  DELIVERED: "DELIVERED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  UNKNOWN: "UNKNOWN",
});

export const SMS_STATUS_LABELS = Object.freeze({
  CREATED: "Creado",
  QUEUED: "En cola",
  SENDING: "Enviando",
  ACCEPTED: "Aceptado por proveedor",
  PENDING_CONFIRMATION: "Pendiente de confirmación",
  DELIVERED: "Entregado",
  REJECTED: "Rechazado por proveedor",
  FAILED: "Fallido",
  EXPIRED: "Expirado",
  CANCELLED: "Cancelado",
  UNKNOWN: "Estado desconocido",
});

// Aceptado por el proveedor (con o sin confirmación de entrega posterior).
// "Aceptado" nunca equivale a "entregado": DELIVERED solo llega por smsstatus.
export const PROVIDER_ACCEPTED_STATUSES = Object.freeze(["ACCEPTED", "PENDING_CONFIRMATION", "DELIVERED", "EXPIRED"]);
export const AWAITING_DELIVERY_STATUSES = Object.freeze(["ACCEPTED", "PENDING_CONFIRMATION"]);
export const IN_PROGRESS_STATUSES = Object.freeze(["CREATED", "QUEUED", "SENDING"]);
export const FINAL_STATUSES = Object.freeze(["DELIVERED", "REJECTED", "FAILED", "EXPIRED", "CANCELLED"]);

export const SMS_MODULES = Object.freeze(["ON_STREET", "OFF_STREET", "ALERTS", "HELPDESK", "ADMIN", "DIAGNOSTIC", "OTHER"]);
export const SMS_MODULE_LABELS = Object.freeze({
  ON_STREET: "On Street",
  OFF_STREET: "Off Street",
  ALERTS: "Alertas operacionales",
  HELPDESK: "Mesa de Ayuda",
  ADMIN: "Comunicaciones administrativas",
  DIAGNOSTIC: "Diagnóstico",
  OTHER: "Otros",
});

export const ERROR_CATEGORIES = Object.freeze({
  AUTH: "Error de autenticación",
  CONNECTIVITY: "Problema de conectividad",
  INVALID_PHONE: "Teléfono inválido",
  PROVIDER_REJECTED: "Rechazo del proveedor",
  NO_BALANCE: "Falta de saldo",
  TEMPORARY: "Error temporal",
  UNCONFIRMED: "Sin confirmación",
  CONFIG: "Configuración incompleta",
  VALIDATION: "Datos inválidos",
  UNKNOWN: "Error no clasificado",
});

const CHILEAN_MOBILE = /^\+569[0-9]{8}$/;
export const SMS_MAX_LENGTH = 160;

function codeError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

// Acepta las formas habituales de escribir un celular chileno y devuelve
// +569XXXXXXXX, o null si no es un móvil chileno válido. No acepta fijos ni
// números extranjeros: Sentraland (tkFinanciero) solo se usa para móviles CL.
export function normalizeChileanMobile(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw || /[^0-9+\s().-]/.test(raw)) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  if (compact.lastIndexOf("+") > 0) return null;
  let digits = compact.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("569")) return `+${digits}`;
  if (compact.startsWith("+")) return null; // con prefijo internacional distinto de +56 9
  if (digits.length === 9 && digits.startsWith("9")) return `+56${digits}`;
  return null;
}

export function isChileanMobile(phone) {
  return CHILEAN_MOBILE.test(String(phone || ""));
}

// +56 9 ****4044 — solo los últimos 4 dígitos visibles.
export function maskPhone(phone, last4) {
  const tail = last4 || (isChileanMobile(phone) ? String(phone).slice(-4) : null);
  return tail ? `+56 9 ****${tail}` : "No registrado";
}

export function validateSmsBody(text) {
  const body = String(text ?? "");
  if (!body.trim()) return { ok: false, code: "SMS_BODY_EMPTY" };
  if (body.length > SMS_MAX_LENGTH) return { ok: false, code: "SMS_BODY_TOO_LONG", length: body.length, max: SMS_MAX_LENGTH };
  // Caracteres fuera de GSM-7 (p. ej. tildes o emojis) pueden ser
  // reemplazados o partir el mensaje según el operador; se advierte, no se bloquea.
  const nonGsm = /[^A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]/.test(body);
  return { ok: true, body, length: body.length, warnings: nonGsm ? ["NON_GSM_CHARACTERS"] : [] };
}

// Catálogo tkFinanciero (sentralandCore.SENTRALAND_SEND_ERROR_DESCRIPTIONS)
// llevado a categorías y a "¿es seguro reintentar?". Solo se reintenta lo que
// Sentraland declara como contingencia/temporal; 8 y 11 ("error al registrar
// DLR") no dicen si el SMS salió, por eso quedan como estado desconocido.
const SENTRALAND_CODE_RULES = Object.freeze({
  1: { status: "REJECTED", category: "PROVIDER_REJECTED", retryable: false },
  2: { status: "REJECTED", category: "NO_BALANCE", retryable: false },
  3: { status: "REJECTED", category: "VALIDATION", retryable: false },
  4: { status: "REJECTED", category: "INVALID_PHONE", retryable: false },
  6: { status: "REJECTED", category: "VALIDATION", retryable: false },
  7: { status: "FAILED", category: "TEMPORARY", retryable: true },
  8: { status: "UNKNOWN", category: "UNKNOWN", retryable: false },
  9: { status: "FAILED", category: "TEMPORARY", retryable: true },
  10: { status: "FAILED", category: "TEMPORARY", retryable: true },
  11: { status: "UNKNOWN", category: "UNKNOWN", retryable: false },
  12: { status: "FAILED", category: "TEMPORARY", retryable: true },
  13: { status: "REJECTED", category: "INVALID_PHONE", retryable: false },
  20: { status: "FAILED", category: "TEMPORARY", retryable: true },
});

// Clasifica el desenlace de un intento de envío.
//  - result: lo que devuelve provider.send() ({ ok, providerMessageId, providerStatus, providerDescription, errorCode })
//  - error: excepción lanzada; error.smsPhase = "TOKEN" | "SEND" cuando el
//    servicio central la conoce (ver smsCenterServiceCore.mjs).
// Regla de oro: si no se puede descartar que Sentraland haya aceptado el
// mensaje (timeout o respuesta ilegible DURANTE el envío), el estado es
// UNKNOWN y jamás se reintenta automáticamente.
export function classifySendOutcome({ result, error } = {}) {
  if (!error && result?.ok) {
    return { status: "ACCEPTED", category: null, retryable: false, errorCode: null, providerCode: result.providerStatus ?? null, providerDescription: result.providerDescription ?? null };
  }
  if (!error && result) {
    const code = Number(result.providerStatus);
    const rule = SENTRALAND_CODE_RULES[code];
    return {
      status: rule?.status || "REJECTED",
      category: rule?.category || "PROVIDER_REJECTED",
      retryable: rule?.retryable || false,
      errorCode: result.errorCode || (Number.isFinite(code) ? `SENTRALAND_${code}` : "PROVIDER_ERROR"),
      providerCode: result.providerStatus ?? null,
      providerDescription: result.providerDescription ?? null,
    };
  }
  const code = String(error?.code || "PROVIDER_ERROR");
  const phase = error?.smsPhase || null;
  const base = { errorCode: code, providerCode: error?.providerCode != null ? String(error.providerCode) : null, providerDescription: error?.providerDescription ?? null };
  if (code.endsWith("_NOT_CONFIGURED") || code === "SMS_PROVIDER_UNKNOWN") return { ...base, status: "FAILED", category: "CONFIG", retryable: false };
  if (code === "SENTRALAND_PHONE_INVALID") return { ...base, status: "FAILED", category: "INVALID_PHONE", retryable: false };
  if (["SENTRALAND_MESSAGE_EMPTY", "SENTRALAND_MESSAGE_TOO_LONG", "SMS_MESSAGE_INVALID", "INVALID_MESSAGE"].includes(code)) return { ...base, status: "FAILED", category: "VALIDATION", retryable: false };
  if (code.startsWith("SENTRALAND_TOKEN")) return { ...base, status: "FAILED", category: "AUTH", retryable: true };
  const transport = ["SENTRALAND_TIMEOUT", "SENTRALAND_HTTP_ERROR", "SENTRALAND_RESPONSE_INVALID"].includes(code) || error?.name === "TypeError";
  if (transport && phase === "TOKEN") {
    return { ...base, status: "FAILED", category: error?.status === 401 || error?.status === 403 ? "AUTH" : "CONNECTIVITY", retryable: true };
  }
  if (transport && phase === "SEND") {
    // HTTP 4xx (distinto de 429) = el proveedor rechazó la petición antes de procesarla.
    if (code === "SENTRALAND_HTTP_ERROR" && error?.status >= 400 && error?.status < 500 && error?.status !== 429) {
      return { ...base, status: "FAILED", category: error.status === 401 || error.status === 403 ? "AUTH" : "CONNECTIVITY", retryable: false };
    }
    return { ...base, status: "UNKNOWN", category: "CONNECTIVITY", retryable: false };
  }
  return { ...base, status: transport ? "UNKNOWN" : "FAILED", category: transport ? "CONNECTIVITY" : "UNKNOWN", retryable: false };
}

// deliveryState de sentralandCore.mapSentralandDeliveryState -> estado del centro.
export function statusFromDeliveryState(deliveryState) {
  switch (deliveryState) {
    case "DELIVERED": return "DELIVERED";
    case "ACCEPTED": return "PENDING_CONFIRMATION";
    case "UNDELIVERED": return "FAILED";
    case "EXPIRED": return "EXPIRED";
    case "REJECTED": return "REJECTED";
    default: return "UNKNOWN";
  }
}

// Espera antes del siguiente intento automático, o null si ya no corresponde.
// attemptsDone = intentos ya realizados (incluido el que acaba de fallar).
export function nextRetryDelaySeconds(attemptsDone, { maxAttempts = 1, delaysSeconds = [60, 300, 900] } = {}) {
  if (!Number.isInteger(attemptsDone) || attemptsDone < 1) return null;
  if (attemptsDone >= maxAttempts) return null;
  const delays = Array.isArray(delaysSeconds) && delaysSeconds.length ? delaysSeconds : [60, 300, 900];
  return delays[Math.min(attemptsDone - 1, delays.length - 1)];
}

// Un reenvío manual solo tiene sentido si el mensaje terminó sin entregarse.
// UNKNOWN exige reconocer explícitamente que podría duplicarse.
export function resendEligibility(row, { acknowledgeDuplicateRisk = false } = {}) {
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.redacted_at) return { ok: false, code: "REDACTED" };
  if (row.error_category === "INVALID_PHONE") return { ok: false, code: "INVALID_PHONE" };
  if (row.error_category === "CONFIG") return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  if (["FAILED", "REJECTED", "EXPIRED"].includes(row.status)) return { ok: true };
  if (row.status === "UNKNOWN") return acknowledgeDuplicateRisk ? { ok: true, duplicateRisk: true } : { ok: false, code: "DUPLICATE_RISK_NOT_ACKNOWLEDGED" };
  return { ok: false, code: "STATUS_NOT_RESENDABLE", status: row.status };
}

export function isUnconfirmed(row, { now = new Date(), afterHours = 24 } = {}) {
  if (!row || !AWAITING_DELIVERY_STATUSES.includes(row.status) || row.is_simulated) return false;
  const since = Date.parse(row.accepted_at || row.sent_at || row.created_at || "");
  return Number.isFinite(since) && now.getTime() - since >= afterHours * 3_600_000;
}

const SECRET_KEY = /pass|token|secret|usuario|user|institucion|authorization|credential|api[_-]?key/i;

// Copia profunda sin claves sensibles: lo que se guarda como "respuesta
// técnica" nunca incluye credenciales ni el token de Sentraland.
export function sanitizeProviderDetail(value, depth = 0) {
  if (depth > 4 || value == null) return value ?? null;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeProviderDetail(item, depth + 1));
  if (typeof value !== "object") return typeof value === "string" ? value.slice(0, 500) : value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    out[key] = sanitizeProviderDetail(item, depth + 1);
  }
  return out;
}

const IDEMPOTENCY_PART = /^[A-Za-z0-9:_.-]{1,200}$/;

export function buildIdempotencyKey(...parts) {
  const clean = parts.map((part) => String(part ?? "").trim());
  if (!clean.length || clean.some((part) => !IDEMPOTENCY_PART.test(part))) throw codeError("SMS_IDEMPOTENCY_KEY_INVALID");
  const key = clean.join(":");
  if (key.length < 8 || key.length > 200) throw codeError("SMS_IDEMPOTENCY_KEY_INVALID");
  return key;
}

// Valida y normaliza una solicitud de envío antes de tocar la base o el proveedor.
export function prepareSendRequest(input = {}) {
  const smsModule = String(input.module || "");
  if (!SMS_MODULES.includes(smsModule)) throw codeError("SMS_MODULE_INVALID");
  const messageType = String(input.messageType || "").trim();
  if (!/^[A-Z0-9_]{1,60}$/.test(messageType)) throw codeError("SMS_MESSAGE_TYPE_INVALID");
  const phone = normalizeChileanMobile(input.phone);
  if (!phone) throw codeError("SMS_PHONE_INVALID");
  const body = validateSmsBody(input.body);
  if (!body.ok) throw codeError(body.code, { length: body.length, max: body.max });
  const idempotencyKey = buildIdempotencyKey(input.idempotencyKey);
  const maxAttempts = input.maxAttempts == null ? 1 : Number(input.maxAttempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 6) throw codeError("SMS_MAX_ATTEMPTS_INVALID");
  return {
    module: smsModule,
    messageType,
    phone,
    body: body.body,
    warnings: body.warnings,
    idempotencyKey,
    maxAttempts,
    companyId: input.companyId ? String(input.companyId) : null,
    parkingId: input.parkingId ? String(input.parkingId) : null,
    originUserId: input.originUserId ? String(input.originUserId) : null,
    parentMessageId: input.parentMessageId ? String(input.parentMessageId) : null,
    metadata: sanitizeProviderDetail(input.metadata || {}),
  };
}
