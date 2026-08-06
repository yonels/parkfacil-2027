import { CHANNEL_PROVIDER } from "./constants.js";
import { mapNotificationRow, normalizeNotificationFilters, sanitizeNotificationPayload } from "./normalizers.js";
import { assertStatusTransition, validateNotificationInput } from "./notificationValidators.js";
import { applyNotificationScope } from "@/lib/auth/remainingAuthorization";

function controlledRepositoryError(error, fallback = "notification_repository_error") {
  return { message: error?.message || "Error de repositorio de notificaciones.", code: error?.code || fallback, details: error?.details || null };
}

export async function createNotification(supabase, input = {}) {
  const { type, channel, status } = validateNotificationInput(input);
  const payload = sanitizeNotificationPayload(input.payload || {});
  const values = {
    organization_id: input.organizationId || input.organization_id || null,
    parking_id: input.parkingId || input.parking_id || null,
    subscriber_id: input.subscriberId || input.subscriber_id || null,
    user_id: input.userId || input.user_id || null,
    type,
    channel,
    status,
    recipient: input.recipient || null,
    recipient_name: input.recipientName || input.recipient_name || null,
    subject: input.subject || null,
    template_key: input.templateKey || input.template_key || null,
    payload,
    provider: input.provider || CHANNEL_PROVIDER[channel] || null,
    created_by: input.createdBy || input.created_by || null,
  };
  const { data, error } = await supabase.from("notifications").insert(values).select("*").single();
  if (error) throw Object.assign(new Error("No fue posible crear la notificación."), controlledRepositoryError(error));
  return mapNotificationRow(data);
}

export async function getNotificationById(supabase, id, scope = null) {
  const { data, error } = await applyNotificationScope(supabase.from("notifications").select("*"), scope).eq("id", id).maybeSingle();
  if (!data && !error) throw Object.assign(new Error("Notificacion no encontrada."), { code: "notification_not_found" });
  if (error) throw Object.assign(new Error("Notificación no encontrada."), controlledRepositoryError(error, "notification_not_found"));
  return mapNotificationRow(data);
}

export async function listNotificationAttempts(supabase, notificationId) {
  const { data, error } = await supabase.from("notification_attempts").select("*").eq("notification_id", notificationId).order("attempt_number", { ascending: true });
  if (error) throw Object.assign(new Error("No fue posible cargar los intentos."), controlledRepositoryError(error));
  return data || [];
}

export async function listNotifications(supabase, filtersInput = {}, scope = null) {
  const filters = normalizeNotificationFilters(filtersInput);
  let query = supabase.from("notifications").select("*", { count: "exact" });
  query = applyNotificationScope(query, scope);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.subscriberId) query = query.eq("subscriber_id", filters.subscriberId);
  if (filters.parkingId) query = query.eq("parking_id", filters.parkingId);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  if (filters.search) {
    const term = filters.search.replace(/[%(),]/g, "");
    query = query.or(`recipient.ilike.%${term}%,recipient_name.ilike.%${term}%,subject.ilike.%${term}%,provider_message_id.ilike.%${term}%`);
  }
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(filters.from, filters.to);
  if (error) throw Object.assign(new Error("No fue posible listar notificaciones."), controlledRepositoryError(error));
  const total = count || 0;
  return { data: (data || []).map(mapNotificationRow), pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)) } };
}

export async function updateNotificationStatus(supabase, id, status, extra = {}) {
  const nextStatus = assertStatusTransition(status);
  const timestamp = new Date().toISOString();
  const values = { status: nextStatus, updated_at: timestamp, ...extra };
  if (nextStatus === "processing") values.processing_at = values.processing_at || timestamp;
  if (nextStatus === "sent") values.sent_at = values.sent_at || timestamp;
  if (nextStatus === "delivered") values.delivered_at = values.delivered_at || timestamp;
  if (nextStatus === "cancelled") values.cancelled_at = values.cancelled_at || timestamp;
  const { data, error } = await supabase.from("notifications").update(values).eq("id", id).select("*").single();
  if (error) throw Object.assign(new Error("No fue posible actualizar el estado."), controlledRepositoryError(error));
  return mapNotificationRow(data);
}

export async function recordNotificationAttempt(supabase, input = {}) {
  const values = {
    notification_id: input.notificationId || input.notification_id,
    attempt_number: input.attemptNumber || input.attempt_number || 1,
    provider: input.provider || null,
    request_summary: sanitizeNotificationPayload(input.requestSummary || input.request_summary || {}),
    response_summary: sanitizeNotificationPayload(input.responseSummary || input.response_summary || {}),
    status: input.status || "pending",
    error_code: input.errorCode || input.error_code || null,
    error_message: input.errorMessage || input.error_message || null,
    finished_at: input.finishedAt || input.finished_at || null,
  };
  const { data, error } = await supabase.from("notification_attempts").insert(values).select("*").single();
  if (error) throw Object.assign(new Error("No fue posible registrar el intento."), controlledRepositoryError(error));
  return data;
}

export async function getNotificationSummary(supabase, filtersInput = {}, scope = null) {
  const filters = normalizeNotificationFilters({ ...filtersInput, page: 1, page_size: 1 });
  let query = supabase.from("notifications").select("status", { count: "exact" });
  query = applyNotificationScope(query, scope);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.subscriberId) query = query.eq("subscriber_id", filters.subscriberId);
  if (filters.parkingId) query = query.eq("parking_id", filters.parkingId);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  const { data, error, count } = await query.limit(10000);
  if (error) throw Object.assign(new Error("No fue posible calcular el resumen."), controlledRepositoryError(error));
  const summary = { total: count || 0, pending: 0, sent: 0, delivered: 0, failed: 0 };
  for (const item of data || []) {
    if (Object.prototype.hasOwnProperty.call(summary, item.status)) summary[item.status] += 1;
  }
  return summary;
}
