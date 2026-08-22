export const SMS_NOTIFICATION_TYPES = Object.freeze({ EXPIRING_SOON: "EXPIRING_SOON", EXPIRED: "EXPIRED" });
export const SMS_NOTIFICATION_STATUSES = Object.freeze({ PENDING: "PENDING", SENT: "SENT", FAILED: "FAILED", CANCELLED: "CANCELLED" });
export function secureSessionUrl(origin, message) {
  const match = String(message || "").match(/\/estacionar\/sesion\/[0-9a-f-]{36}$/i);
  if (!match) return null;
  return `${String(origin || "").replace(/\/$/, "")}${match[0]}`;
}
export function publicSmsMessage(origin, storedMessage) {
  const url = secureSessionUrl(origin, storedMessage);
  return url ? storedMessage.replace(/\/estacionar\/sesion\/[0-9a-f-]{36}$/i, url) : null;
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
