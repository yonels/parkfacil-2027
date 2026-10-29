// Núcleo puro de la administración del Centro de Control SMS
// (SOL-2026-10-29-007): validación de configuración y tarifas, preparación de
// reenvíos desde el historial, columnas de exportación y estado de
// configuración del proveedor. Sin "server-only" para testearlo directo.
import { INSPECTION_OVERDUE_SMS_TEXT } from "../inspector/inspectorSms.mjs";
import { ERROR_CATEGORIES, normalizeChileanMobile, resendEligibility, SMS_MODULE_LABELS, SMS_STATUS_LABELS } from "./smsCenterCore.mjs";
import { HISTORY_SOURCES, MESSAGE_TYPE_LABELS } from "./smsHistoryCore.mjs";

function invalid(field, message) {
  return Object.assign(new Error("SMS_VALIDATION_ERROR"), { code: "SMS_VALIDATION_ERROR", status: 400, field, details: { [field]: message } });
}

function intIn(value, min, max, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(field, `Debe ser un número entero entre ${min} y ${max}.`);
  return n;
}

// Configuración editable. inbound_enabled NO se edita aquí: solo se activa
// cuando exista una integración de recepción real con Sentraland.
export function validateSmsSettings(input = {}) {
  const phones = Array.isArray(input.testAllowedPhones) ? input.testAllowedPhones : String(input.testAllowedPhones || "").split(/[\n,;]+/);
  const normalized = [];
  for (const raw of phones.map((p) => String(p).trim()).filter(Boolean)) {
    const phone = normalizeChileanMobile(raw);
    if (!phone) throw invalid("testAllowedPhones", `«${raw.slice(0, 20)}» no es un celular chileno válido.`);
    if (!normalized.includes(phone)) normalized.push(phone);
  }
  if (!normalized.length) throw invalid("testAllowedPhones", "Debe haber al menos un número autorizado para pruebas.");
  if (normalized.length > 10) throw invalid("testAllowedPhones", "Máximo 10 números autorizados.");
  const delays = (Array.isArray(input.autoRetryDelaysSeconds) ? input.autoRetryDelaysSeconds : String(input.autoRetryDelaysSeconds || "").split(/[\s,;]+/))
    .filter((v) => String(v).trim() !== "").map((v) => intIn(v, 30, 86_400, "autoRetryDelaysSeconds"));
  if (!delays.length || delays.length > 5) throw invalid("autoRetryDelaysSeconds", "Indica entre 1 y 5 esperas (segundos).");
  for (let i = 1; i < delays.length; i += 1) if (delays[i] < delays[i - 1]) throw invalid("autoRetryDelaysSeconds", "Las esperas deben ser progresivas (no decrecientes).");
  return {
    retention_days: intIn(input.retentionDays, 30, 3650, "retentionDays"),
    rate_limit_user_per_hour: intIn(input.rateLimitUserPerHour, 1, 10_000, "rateLimitUserPerHour"),
    rate_limit_company_per_hour: intIn(input.rateLimitCompanyPerHour, 1, 100_000, "rateLimitCompanyPerHour"),
    rate_limit_phone_per_hour: intIn(input.rateLimitPhonePerHour, 1, 1000, "rateLimitPhonePerHour"),
    test_send_cooldown_seconds: intIn(input.testSendCooldownSeconds, 10, 86_400, "testSendCooldownSeconds"),
    test_allowed_phones: normalized,
    auto_retry_max: intIn(input.autoRetryMax, 0, 5, "autoRetryMax"),
    auto_retry_delays_seconds: delays,
    unconfirmed_after_hours: intIn(input.unconfirmedAfterHours, 1, 720, "unconfirmedAfterHours"),
  };
}

export function shapeSmsSettings(row = {}) {
  return {
    retentionDays: row.retention_days,
    rateLimitUserPerHour: row.rate_limit_user_per_hour,
    rateLimitCompanyPerHour: row.rate_limit_company_per_hour,
    rateLimitPhonePerHour: row.rate_limit_phone_per_hour,
    testSendCooldownSeconds: row.test_send_cooldown_seconds,
    testAllowedPhones: row.test_allowed_phones || [],
    autoRetryMax: row.auto_retry_max,
    autoRetryDelaysSeconds: row.auto_retry_delays_seconds || [],
    unconfirmedAfterHours: row.unconfirmed_after_hours,
    inboundEnabled: Boolean(row.inbound_enabled),
    updatedAt: row.updated_at || null,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateTariff(input = {}) {
  const unitPrice = Number(String(input.unitPrice ?? "").replace(",", "."));
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000) throw invalid("unitPrice", "Ingresa un valor unitario válido (0 o mayor).");
  const currency = String(input.currency || "CLP");
  if (!["CLP", "UF", "USD"].includes(currency)) throw invalid("currency", "Moneda no válida.");
  const validFrom = String(input.validFrom || "");
  if (!DATE_RE.test(validFrom) || Number.isNaN(Date.parse(validFrom))) throw invalid("validFrom", "Indica la fecha de inicio de vigencia.");
  const validTo = input.validTo ? String(input.validTo) : null;
  if (validTo && (!DATE_RE.test(validTo) || validTo < validFrom)) throw invalid("validTo", "La fecha de término debe ser igual o posterior al inicio.");
  const companyId = input.companyId ? String(input.companyId) : null;
  if (companyId && !/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) throw invalid("companyId", "Empresa no válida.");
  return {
    unit_price: Math.round(unitPrice * 10_000) / 10_000,
    currency,
    valid_from: validFrom,
    valid_to: validTo,
    company_id: companyId,
    source: "INTERNAL",
    notes: input.notes ? String(input.notes).slice(0, 300) : null,
  };
}

// Prepara un reenvío desde cualquier fila del historial (central o
// heredada). Los registros On Street no se modifican: el reenvío es un
// mensaje NUEVO del registro central, enlazado por metadata.
export function prepareResendFromHistory(row, { acknowledgeDuplicateRisk = false } = {}) {
  const eligibility = resendEligibility(row, { acknowledgeDuplicateRisk });
  if (!eligibility.ok) return eligibility;
  if (!row.phone_normalized) return { ok: false, code: "PHONE_NOT_STORED" };
  let body = row.body;
  if (!body && row.message_type === "INSPECTION_OVERDUE") body = INSPECTION_OVERDUE_SMS_TEXT;
  if (!body) return { ok: false, code: "BODY_NOT_STORED" };
  return {
    ok: true,
    duplicateRisk: Boolean(eligibility.duplicateRisk),
    request: {
      module: row.module,
      messageType: String(row.message_type || "RESEND").replace(/[^A-Z0-9_]/g, "_").slice(0, 60) || "RESEND",
      companyId: row.company_id,
      parkingId: row.parking_id,
      phone: row.phone_normalized,
      body,
      parentMessageId: row.source === "CENTRAL" ? row.message_id : null,
      metadata: { resendOf: { source: row.source, id: row.source_id } },
    },
  };
}

export const RESEND_ERROR_MESSAGES = Object.freeze({
  NOT_FOUND: "No se encontró el mensaje.",
  REDACTED: "El mensaje fue anonimizado por retención; no se puede reenviar.",
  INVALID_PHONE: "El teléfono es inválido; corrige el dato de origen en lugar de reenviar.",
  PROVIDER_NOT_CONFIGURED: "El proveedor no está configurado; revisa Diagnóstico antes de reenviar.",
  DUPLICATE_RISK_NOT_ACKNOWLEDGED: "El estado es desconocido: el SMS pudo haber llegado. Confirma que aceptas el riesgo de duplicado.",
  STATUS_NOT_RESENDABLE: "Solo se reenvían mensajes fallidos, rechazados, expirados o desconocidos.",
  PHONE_NOT_STORED: "Este registro no guarda el teléfono de destino (copia al inspector).",
  BODY_NOT_STORED: "Este registro no guarda el texto del mensaje.",
});

// Columnas de exportación. El teléfono va siempre enmascarado y el contenido
// solo si el usuario tiene permiso y lo pide explícitamente.
export function exportColumns({ includeContent = false } = {}) {
  const cols = [
    { key: "createdAt", label: "Fecha creación" },
    { key: "sentAt", label: "Fecha envío" },
    { key: "deliveredAt", label: "Fecha entrega" },
    { key: "phone", label: "Teléfono (enmascarado)" },
    { key: "companyName", label: "Cliente" },
    { key: "parkingName", label: "Establecimiento" },
    { key: "moduleLabel", label: "Módulo" },
    { key: "messageTypeLabel", label: "Tipo" },
    { key: "originUserName", label: "Originado por" },
    { key: "sourceLabel", label: "Registro de origen" },
    { key: "sourceId", label: "ID interno" },
    { key: "providerMessageId", label: "ID Sentraland" },
    { key: "statusLabel", label: "Estado" },
    { key: "isSimulated", label: "Simulado", value: (r) => (r.isSimulated ? "Sí" : "No") },
    { key: "errorCode", label: "Código de error" },
    { key: "errorCategoryLabel", label: "Categoría de error" },
    { key: "providerDescription", label: "Descripción proveedor" },
    { key: "attempts", label: "Intentos" },
  ];
  if (includeContent) cols.push({ key: "body", label: "Contenido" });
  return cols;
}

export const EXPORT_MAX_ROWS = 10_000;

// Estado de configuración SIN valores: solo presencia y forma. Nunca
// devuelve credenciales ni sus longitudes exactas.
export function providerConfigStatus(env = process.env) {
  const requested = String(env.SMS_PROVIDER || "").trim().toLowerCase();
  const provider = requested || "simulated";
  const vars = ["SENTRALAND_INSTITUCION", "SENTRALAND_TIPO_SERVICIO", "SENTRALAND_USUARIO", "SENTRALAND_PASSWORD"].map((name) => {
    const value = String(env[name] ?? "");
    return { name, present: value.trim().length > 0, clean: value === value.trim() && !/^["']|["']$/.test(value) };
  });
  const urls = ["SENTRALAND_TOKEN_URL", "SENTRALAND_SEND_URL", "SENTRALAND_STATUS_URL", "SENTRALAND_BALANCE_URL"].map((name) => {
    const value = String(env[name] || "");
    let host = null;
    try { host = value ? new URL(value).host : null; } catch { host = "URL inválida"; }
    return { name, custom: Boolean(value), host: host || "ws.sentraland.net (por defecto)" };
  });
  return {
    provider: provider === "sentraland" ? "SENTRALAND" : provider === "simulated" ? "SIMULATED" : "DESCONOCIDO",
    mode: provider === "sentraland" ? "REAL" : "SIMULATED",
    providerDefaulted: !requested,
    vars,
    urls,
    configOk: provider === "simulated" || (provider === "sentraland" && vars.every((v) => v.present)),
    missingVars: provider === "sentraland" ? vars.filter((v) => !v.present).map((v) => v.name) : [],
  };
}

export const SMS_TEST_TEXT = "ParkFacil: Prueba de servicio SMS Sentraland. Verificacion de envio y recepcion. No requiere respuesta.";

export const PERMISSION_MATRIX = Object.freeze([
  { permission: "sms:read", label: "Ver resumen, historial, fallos y consumo" },
  { permission: "sms:content:read", label: "Ver el contenido de los SMS" },
  { permission: "sms:phone:full", label: "Revelar el teléfono completo (auditado)" },
  { permission: "sms:export", label: "Exportar a Excel o CSV (auditado)" },
  { permission: "sms:manage", label: "Reenviar, cancelar, tarifas, configuración y retención" },
  { permission: "sms:test", label: "Diagnóstico y envío de prueba" },
]);

export { ERROR_CATEGORIES, HISTORY_SOURCES, MESSAGE_TYPE_LABELS, SMS_MODULE_LABELS, SMS_STATUS_LABELS };
