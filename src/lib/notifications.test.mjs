import test from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_LABELS, STATUS_LABELS, TYPE_LABELS } from "./notifications/constants.js";
import { getChannelLabel, getStatusLabel, getTypeLabel, normalizeChannel, normalizeNotificationFilters, normalizePagination, normalizeStatus, normalizeType, sanitizeNotificationPayload, NotificationValidationError } from "./notifications/normalizers.js";
import { createNotification, getNotificationSummary, recordNotificationAttempt, updateNotificationStatus } from "./notifications/notificationRepository.js";
import { prepareNotification } from "./notifications/notificationService.js";
import { getEmailProviderStatus } from "./notifications/providers/emailProvider.js";
import { getWhatsappProviderStatus, prepareWhatsappNotification } from "./notifications/providers/whatsappProvider.js";

function createMockSupabase() {
  const notifications = [];
  const attempts = [];
  const apiFor = (table) => {
    const state = { table, op: "select", values: null, filters: [], range: null, order: null };
    const api = {
      select() { return api; },
      insert(values) { state.op = "insert"; state.values = values; return api; },
      update(values) { state.op = "update"; state.values = values; return api; },
      eq(key, value) { state.filters.push({ key, value }); return api; },
      gte() { return api; },
      lte() { return api; },
      or() { return api; },
      order(key, options) { state.order = { key, options }; return api; },
      range(from, to) { state.range = { from, to }; return api.then((value) => value); },
      limit() { return api.then((value) => value); },
      single: async () => {
        if (state.op === "insert") {
          const row = { id: `${table}-${table === "notifications" ? notifications.length + 1 : attempts.length + 1}`, created_at: "2026-07-28T10:00:00Z", updated_at: "2026-07-28T10:00:00Z", ...state.values };
          if (table === "notifications") notifications.push(row);
          if (table === "notification_attempts") attempts.push(row);
          return { data: row, error: null };
        }
        if (state.op === "update") {
          const row = notifications.find((item) => state.filters.every((filter) => item[filter.key] === filter.value));
          Object.assign(row, state.values);
          return { data: row, error: null };
        }
        const source = table === "notifications" ? notifications : attempts;
        return { data: source.find((item) => state.filters.every((filter) => item[filter.key] === filter.value)) || null, error: null };
      },
      then(resolve) {
        const source = table === "notifications" ? notifications : attempts;
        const rows = source.filter((item) => state.filters.every((filter) => item[filter.key] === filter.value));
        return Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
      },
    };
    return api;
  };
  return { notifications, attempts, from: apiFor };
}

test("normaliza canales, estados, tipos y etiquetas", () => {
  assert.equal(normalizeChannel("EMAIL"), "email");
  assert.equal(normalizeStatus("SENT"), "sent");
  assert.equal(normalizeType("credential_created"), "credential_created");
  assert.equal(getChannelLabel("email"), CHANNEL_LABELS.email);
  assert.equal(getStatusLabel("failed"), STATUS_LABELS.failed);
  assert.equal(getTypeLabel("quote_created"), TYPE_LABELS.quote_created);
  assert.throws(() => normalizeChannel("sms"), NotificationValidationError);
});

test("normaliza filtros y limita paginacion", () => {
  const pagination = normalizePagination({ page: "0", pageSize: "500" });
  assert.equal(pagination.page, 1);
  assert.equal(pagination.pageSize, 100);
  const filters = normalizeNotificationFilters({ channel: "internal", status: "pending", page: "2", page_size: "10", search: "  prueba  " });
  assert.equal(filters.channel, "internal");
  assert.equal(filters.status, "pending");
  assert.equal(filters.from, 10);
  assert.equal(filters.search, "prueba");
});

test("sanitiza payloads sin secretos", () => {
  const clean = sanitizeNotificationPayload({ token: "x", access_token: "x", client_secret: "x", visible: "ok" });
  assert.deepEqual(clean, { visible: "ok" });
  assert.equal(JSON.stringify(clean).includes("token"), false);
});

test("crea notificacion, transiciona estado, registra intento y calcula resumen", async () => {
  const supabase = createMockSupabase();
  const notification = await createNotification(supabase, { type: "credential_created", channel: "email", recipient: "persona@example.com", subject: "Credencial", payload: { token: "no", safe: "yes" } });
  assert.equal(notification.status, "pending");
  assert.equal(notification.payload, undefined);
  assert.deepEqual(notification.payloadSummary, { keys: ["safe"], size: 1 });
  const sent = await updateNotificationStatus(supabase, notification.id, "sent");
  assert.equal(sent.status, "sent");
  const attempt = await recordNotificationAttempt(supabase, { notificationId: notification.id, attemptNumber: 1, provider: "microsoft_graph", status: "sent" });
  assert.equal(attempt.notification_id, notification.id);
  const summary = await getNotificationSummary(supabase);
  assert.equal(summary.total, 1);
  assert.equal(summary.sent, 1);
});

test("servicio prepara sin despacho y rechaza whatsapp deshabilitado de forma controlada", async () => {
  const supabase = createMockSupabase();
  const prepared = await prepareNotification({ supabase, prepareOnly: true, input: { type: "system_alert", channel: "internal", subject: "Aviso" } });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.status, "draft");
  const whatsapp = await prepareNotification({ supabase, prepareOnly: false, input: { type: "operational_alert", channel: "whatsapp", recipient: "+56900000000" } });
  assert.equal(whatsapp.ok, false);
  assert.equal(whatsapp.error.code, "whatsapp_provider_not_configured");
});

test("proveedores informan configuracion sin exponer valores", async () => {
  const emailMissing = getEmailProviderStatus({});
  assert.equal(emailMissing.provider, "microsoft_graph");
  assert.equal(emailMissing.configured, false);
  assert.deepEqual(emailMissing.missingVariables.sort(), ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_SENDER_EMAIL", "MICROSOFT_TENANT_ID"].sort());
  const emailConfigured = getEmailProviderStatus({ MICROSOFT_TENANT_ID: "t", MICROSOFT_CLIENT_ID: "c", MICROSOFT_CLIENT_SECRET: "s", MICROSOFT_SENDER_EMAIL: "sender@example.com" });
  assert.equal(emailConfigured.configured, true);
  assert.equal(JSON.stringify(emailConfigured).includes("sender@example.com"), false);
  const whatsapp = getWhatsappProviderStatus();
  assert.equal(whatsapp.enabled, false);
  await assert.rejects(() => prepareWhatsappNotification(), /WhatsApp/);
});
