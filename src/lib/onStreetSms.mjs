export const SMS_NOTIFICATION_TYPES = Object.freeze({ EXPIRING_SOON: "EXPIRING_SOON", EXPIRED: "EXPIRED" });
export const SMS_NOTIFICATION_STATUSES = Object.freeze({ PENDING: "PENDING", SENT: "SENT", FAILED: "FAILED", CANCELLED: "CANCELLED" });
export const FINAL_SMS_MAX_LENGTH = 160;
// Avisos previos al vencimiento, de mayor a menor anticipación (SOL-2026-11-02-004).
export const SMS_REMINDER_MINUTES = Object.freeze([15, 10, 5]);
export function secureSessionUrl(origin, message) {
  const match = String(message || "").match(/\/estacionar\/sesion\/[0-9a-f-]{36}$/i);
  if (!match) return null;
  return `${String(origin || "").replace(/\/$/, "")}${match[0]}`;
}
export function publicSmsMessage(origin, storedMessage, reminderMinutes) {
  const url = secureSessionUrl(origin, storedMessage);
  if (!url) return null;
  const when = SMS_REMINDER_MINUTES.includes(Number(reminderMinutes)) ? `en ${Number(reminderMinutes)} minutos` : "pronto";
  const message = `ParkFacil: tu estacionamiento vence ${when}. Extiende aquí: ${url}`;
  if (message.length > FINAL_SMS_MAX_LENGTH) {
    throw Object.assign(new Error("SMS_MESSAGE_TOO_LONG"), { code: "SMS_MESSAGE_TOO_LONG", length: message.length, max: FINAL_SMS_MAX_LENGTH });
  }
  return message;
}

// Cada aviso solo vale hasta que corresponde el siguiente: si el envío se
// atrasa, sale el aviso vigente y no varios juntos. Un aviso sin anticipación
// registrada conserva la ventana histórica de 15 minutos.
export function isReminderWindowOpen(reminderMinutes, remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return false;
  const minutes = Number(reminderMinutes);
  if (!SMS_REMINDER_MINUTES.includes(minutes)) return remainingMs <= 15 * 60 * 1000;
  const next = SMS_REMINDER_MINUTES.find((item) => item < minutes) || 0;
  return remainingMs <= minutes * 60 * 1000 && remainingMs > next * 60 * 1000;
}

// Aviso que representa a una sesión en reportes y detalle: el último enviado o
// fallido; si no hay, el próximo pendiente; si no, el más reciente.
export function selectCurrentReminder(reminders) {
  const rows = [...(reminders || [])].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const processed = rows.filter((row) => row.status === "SENT" || row.status === "FAILED");
  return processed.at(-1) || rows.find((row) => row.status === "PENDING") || rows.at(-1) || null;
}

export function resolveSmsPublicOrigin({ configuredOrigin, requestOrigin, nodeEnv = process.env.NODE_ENV } = {}) {
  const candidate = String(configuredOrigin || requestOrigin || "").trim().replace(/\/$/, "");
  let url;
  try { url = new URL(candidate); }
  catch { throw Object.assign(new Error("SMS_PUBLIC_ORIGIN_INVALID"), { code: "SMS_PUBLIC_ORIGIN_INVALID" }); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (nodeEnv === "production" && (url.protocol !== "https:" || local)) {
    throw Object.assign(new Error("SMS_PUBLIC_ORIGIN_UNSAFE"), { code: "SMS_PUBLIC_ORIGIN_UNSAFE" });
  }
  return url.origin;
}

// Estado de entrega para mostrar en administración — distingue
// explícitamente un envío simulado (nunca contactó un proveedor real) de
// uno real aceptado, entregado o fallido. No confundir con `status`
// (PENDING/PROCESSING/SENT/FAILED/CANCELLED), que es el estado interno del
// aviso; este helper deriva un estado de cara al operador a partir de esa
// fila. Pendiente de integrarse en la UI del panel admin (no incluido en
// esta entrega).
export function notificationDeliveryState(row) {
  if (!row) return "UNKNOWN";
  if (row.status === "PENDING" || row.status === "PROCESSING" || row.status === "CANCELLED") return row.status;
  if (row.status === "FAILED") return "FAILED";
  if (row.provider === "SIMULATED") return "SIMULATED";
  if (row.delivered_at) return "DELIVERED";
  if (row.accepted_at) return "ACCEPTED";
  return "UNKNOWN";
}
