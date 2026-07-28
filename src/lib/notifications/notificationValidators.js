import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES } from "./constants.js";
import { NotificationValidationError, normalizeChannel, normalizeStatus, normalizeType } from "./normalizers.js";

export function validateNotificationInput(input = {}) {
  const type = normalizeType(input.type);
  const channel = normalizeChannel(input.channel);
  const status = input.status ? normalizeStatus(input.status) : "pending";
  if (!type) throw new NotificationValidationError("El tipo de notificación es obligatorio.", "missing_type");
  if (!channel) throw new NotificationValidationError("El canal de notificación es obligatorio.", "missing_channel");
  if (!NOTIFICATION_TYPES.includes(type)) throw new NotificationValidationError("Tipo de notificación desconocido.", "unknown_type");
  if (!NOTIFICATION_CHANNELS.includes(channel)) throw new NotificationValidationError("Canal de notificación desconocido.", "unknown_channel");
  if (!NOTIFICATION_STATUSES.includes(status)) throw new NotificationValidationError("Estado de notificación desconocido.", "unknown_status");
  return { type, channel, status };
}

export function assertStatusTransition(status) {
  return normalizeStatus(status);
}
