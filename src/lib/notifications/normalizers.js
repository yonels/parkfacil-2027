import { CHANNEL_LABELS, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TYPES, STATUS_LABELS, TYPE_LABELS } from "./constants.js";

export class NotificationValidationError extends Error {
  constructor(message, code = "notification_validation_error", status = 400) {
    super(message);
    this.name = "NotificationValidationError";
    this.code = code;
    this.status = status;
  }
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeChannel(value) {
  const channel = normalizeToken(value);
  if (!channel) return null;
  if (!NOTIFICATION_CHANNELS.includes(channel)) throw new NotificationValidationError("Canal de notificación desconocido.", "unknown_channel");
  return channel;
}

export function normalizeStatus(value) {
  const status = normalizeToken(value);
  if (!status) return null;
  if (!NOTIFICATION_STATUSES.includes(status)) throw new NotificationValidationError("Estado de notificación desconocido.", "unknown_status");
  return status;
}

export function normalizeType(value) {
  const type = normalizeToken(value);
  if (!type) return null;
  if (!NOTIFICATION_TYPES.includes(type)) throw new NotificationValidationError("Tipo de notificación desconocido.", "unknown_type");
  return type;
}

export function getChannelLabel(channel) {
  return CHANNEL_LABELS[channel] || channel || "No registrado";
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "No registrado";
}

export function getTypeLabel(type) {
  return TYPE_LABELS[type] || type || "No registrado";
}

export function normalizePagination({ page, pageSize, limit } = {}) {
  const parsedPage = Math.max(1, Number.parseInt(page || "1", 10) || 1);
  const requestedSize = Number.parseInt(pageSize || limit || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE;
  const parsedPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));
  return { page: parsedPage, pageSize: parsedPageSize, from: (parsedPage - 1) * parsedPageSize, to: parsedPage * parsedPageSize - 1 };
}

export function normalizeNotificationFilters(input = {}) {
  const pagination = normalizePagination({ page: input.page, pageSize: input.page_size || input.pageSize, limit: input.limit });
  return {
    ...pagination,
    status: input.status ? normalizeStatus(input.status) : null,
    channel: input.channel ? normalizeChannel(input.channel) : null,
    type: input.type ? normalizeType(input.type) : null,
    search: String(input.search || "").trim().slice(0, 120),
    dateFrom: String(input.date_from || input.dateFrom || "").trim() || null,
    dateTo: String(input.date_to || input.dateTo || "").trim() || null,
    subscriberId: String(input.subscriber_id || input.subscriberId || "").trim() || null,
    parkingId: String(input.parking_id || input.parkingId || "").trim() || null,
  };
}

export function sanitizeNotificationPayload(payload = {}) {
  const blocked = new Set(["token", "access_token", "refresh_token", "client_secret", "authorization", "password", "secret"]);
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(String(key).toLowerCase())));
}

export function mapNotificationRow(row = {}) {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  return {
    ...row,
    payload: undefined,
    payloadSummary: { keys: Object.keys(payload).slice(0, 20), size: Object.keys(payload).length },
    channelLabel: getChannelLabel(row.channel),
    statusLabel: getStatusLabel(row.status),
    typeLabel: getTypeLabel(row.type),
    whatsappUpcoming: row.channel === "whatsapp",
  };
}
