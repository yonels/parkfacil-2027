// Núcleo puro de consultas del Centro de Control SMS (SOL-2026-10-29-007):
// validación de filtros, construcción de la consulta sobre sms_history_v,
// presentación de filas con enmascarado y línea de tiempo de cada mensaje.
// Sin "server-only" para poder testearlo con node --test.
import { maskPhone, SMS_MODULES, SMS_STATUS, SMS_STATUS_LABELS, SMS_MODULE_LABELS, ERROR_CATEGORIES } from "./smsCenterCore.mjs";

export const SMS_TIME_ZONE = "America/Santiago";
export const HISTORY_SOURCES = Object.freeze({
  CENTRAL: "Centro SMS",
  ON_STREET_NOTIFICATION: "Aviso de vencimiento On Street",
  ON_STREET_INSPECTION: "Fiscalización On Street",
  ON_STREET_INSPECTOR_COPY: "Copia al inspector",
});
export const MESSAGE_TYPE_LABELS = Object.freeze({
  ON_STREET_EXPIRING_SOON: "Aviso: vence pronto",
  ON_STREET_EXPIRED: "Aviso: tiempo finalizado",
  INSPECTION_OVERDUE: "Fiscalización: tiempo vencido",
  INSPECTOR_COPY: "Copia de fiscalización al inspector",
  TEST: "Prueba de diagnóstico",
});
const SORTABLE = Object.freeze(["created_at", "sent_at", "delivered_at", "status", "module", "attempts"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPANY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RANGE_DAYS = 400;

function filterError(field) {
  return Object.assign(new Error("SMS_FILTER_INVALID"), { code: "SMS_FILTER_INVALID", status: 400, field });
}

function offsetMinutes(instant, timeZone) {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(instant).find((p) => p.type === "timeZoneName")?.value || "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(part);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0));
}

// Inicio del día civil (00:00 en Santiago) como instante ISO UTC.
export function zonedDayStartIso(date, timeZone = SMS_TIME_ZONE) {
  if (!DATE_RE.test(String(date || ""))) return null;
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  if (Number.isNaN(guess) || new Date(guess).getUTCDate() !== d) return null;
  let instant = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  instant = guess - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant).toISOString();
}

function nextDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function todayInZone(now = new Date(), timeZone = SMS_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Lee y valida filtros desde URLSearchParams. Valores desconocidos => 400
// (nunca se interpolan en la consulta sin validar).
export function parseSmsFilters(params, { now = new Date(), defaultDays = 30 } = {}) {
  const get = (key) => {
    const value = params?.get?.(key);
    return value == null || value === "" ? null : String(value).trim();
  };
  const to = get("hasta") || todayInZone(now);
  const from = get("desde") || (() => {
    const [y, m, d] = to.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - (defaultDays - 1))).toISOString().slice(0, 10);
  })();
  const fromIso = zonedDayStartIso(from);
  const toIso = zonedDayStartIso(DATE_RE.test(to) ? nextDay(to) : "");
  if (!fromIso) throw filterError("desde");
  if (!toIso) throw filterError("hasta");
  if (fromIso >= toIso) throw filterError("desde");
  if ((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000 > MAX_RANGE_DAYS + 1) throw filterError("rango");

  const companyId = get("empresa");
  if (companyId && !COMPANY_RE.test(companyId)) throw filterError("empresa");
  const parkingId = get("establecimiento");
  if (parkingId && !UUID_RE.test(parkingId)) throw filterError("establecimiento");
  const smsModule = get("modulo");
  if (smsModule && !SMS_MODULES.includes(smsModule)) throw filterError("modulo");
  const status = get("estado");
  if (status && !Object.values(SMS_STATUS).includes(status)) throw filterError("estado");
  const source = get("origen");
  if (source && !HISTORY_SOURCES[source]) throw filterError("origen");
  const bucket = get("agrupar") || "day";
  if (!["day", "week", "month"].includes(bucket)) throw filterError("agrupar");
  const includeSimulated = get("simulados") === "1";
  const rawQ = get("q");
  const q = rawQ ? rawQ.replace(/[^A-Za-z0-9 +:_-]/g, "").slice(0, 60).trim() || null : null;
  const sort = get("orden") || "created_at";
  if (!SORTABLE.includes(sort)) throw filterError("orden");
  const dir = get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(get("pagina") || "1", 10) || 1));
  const pageSize = [10, 25, 50, 100].includes(Number(get("tamano"))) ? Number(get("tamano")) : 25;
  return { from, to, fromIso, toIso, companyId, parkingId, module: smsModule, status, source, bucket, includeSimulated, q, sort, dir, page, pageSize };
}

// Aplica los filtros a una consulta supabase-js sobre sms_history_v.
export function applyHistoryFilters(query, filters) {
  let q = query.gte("created_at", filters.fromIso).lt("created_at", filters.toIso);
  if (filters.companyId) q = q.eq("company_id", filters.companyId);
  if (filters.parkingId) q = q.eq("parking_id", filters.parkingId);
  if (filters.module) q = q.eq("module", filters.module);
  if (filters.status) q = q.eq("status", filters.status);
  else if (Array.isArray(filters.statusIn) && filters.statusIn.length) q = q.in("status", filters.statusIn);
  if (filters.source) q = q.eq("source", filters.source);
  if (!filters.includeSimulated) q = q.eq("is_simulated", false);
  if (filters.q) {
    const digits = filters.q.replace(/\D/g, "");
    const term = filters.q.replace(/[\s+]/g, "");
    const parts = term ? [`provider_message_id.eq.${term}`, `source_id.eq.${term}`, `message_type.ilike.*${term}*`] : [];
    if (digits.length >= 4) parts.push(`phone_normalized.like.*${digits.slice(-8)}*`, `phone_last4.eq.${digits.slice(-4)}`);
    if (parts.length) q = q.or(parts.join(","));
  }
  return q;
}

export function summaryParams(filters) {
  return {
    from: filters.fromIso,
    to: filters.toIso,
    company_id: filters.companyId,
    parking_id: filters.parkingId,
    module: filters.module,
    status: filters.status,
    include_simulated: filters.includeSimulated,
    bucket: filters.bucket,
  };
}

// Tasa de entrega = entregados / aceptados por el proveedor. Sin aceptados
// no hay tasa (null), nunca un 0 % o 100 % inventado.
export function deliveryRate(kpis) {
  const accepted = Number(kpis?.accepted || 0);
  if (!accepted) return null;
  return Math.round((Number(kpis.delivered || 0) / accepted) * 1000) / 10;
}

function statusVariant(status) {
  if (status === "DELIVERED") return "positive";
  if (["ACCEPTED", "PENDING_CONFIRMATION", "QUEUED", "SENDING", "CREATED"].includes(status)) return "info";
  if (["REJECTED", "FAILED", "EXPIRED"].includes(status)) return "error";
  return "warning";
}

export function rowKey(row) {
  return `${row.source}:${row.source_id}`;
}

// Fila para el navegador: teléfono enmascarado salvo permiso, texto solo con
// permiso, etiquetas en español y nombres resueltos.
export function shapeHistoryRow(row, { canSeeFullPhone = false, canSeeContent = false, companies = {}, parkings = {}, users = {} } = {}) {
  return {
    key: rowKey(row),
    source: row.source,
    sourceLabel: HISTORY_SOURCES[row.source] || row.source,
    sourceId: row.source_id,
    messageId: row.message_id || null,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    deliveredAt: row.delivered_at,
    phone: canSeeFullPhone && row.phone_normalized ? row.phone_normalized : maskPhone(row.phone_normalized, row.phone_last4),
    phoneMasked: !(canSeeFullPhone && row.phone_normalized),
    companyId: row.company_id,
    companyName: row.company_id ? companies[row.company_id] || row.company_id : "Sin empresa (transversal)",
    parkingId: row.parking_id,
    parkingName: row.parking_id ? parkings[row.parking_id] || "Establecimiento sin nombre" : "—",
    module: row.module,
    moduleLabel: SMS_MODULE_LABELS[row.module] || row.module,
    originUserId: row.origin_user_id,
    originUserName: row.origin_user_id ? users[row.origin_user_id] || "Usuario no identificado" : "Sistema",
    messageType: row.message_type,
    messageTypeLabel: MESSAGE_TYPE_LABELS[row.message_type] || row.message_type,
    body: canSeeContent ? row.body ?? null : null,
    bodyHidden: !canSeeContent,
    bodyStored: row.body != null,
    status: row.status,
    statusLabel: SMS_STATUS_LABELS[row.status] || row.status,
    statusVariant: statusVariant(row.status),
    provider: row.provider,
    isSimulated: Boolean(row.is_simulated),
    providerMessageId: row.provider_message_id,
    providerCode: row.provider_code,
    providerDescription: row.provider_description,
    errorCode: row.error_code,
    errorCategory: row.error_category,
    errorCategoryLabel: row.error_category ? ERROR_CATEGORIES[row.error_category] || row.error_category : null,
    attempts: row.attempts ?? 0,
    rootMessageId: row.root_message_id,
    parentMessageId: row.parent_message_id,
    redacted: Boolean(row.redacted_at),
  };
}

// Línea de tiempo. Para el registro central son los eventos reales
// guardados; para los registros heredados (On Street / Inspector) no existe
// historial de eventos, así que se reconstruye desde las fechas guardadas y
// se marca "reconstructed" para no presentarlo como un historial completo.
export function buildTimeline(row, events = []) {
  if (row.source === "CENTRAL") {
    return events
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((event) => ({
        at: event.created_at,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        label: SMS_STATUS_LABELS[event.to_status] || event.to_status,
        source: event.source,
        providerCode: event.provider_code,
        providerDescription: event.provider_description,
        detail: event.detail || {},
        reconstructed: false,
      }));
  }
  const items = [{ at: row.created_at, toStatus: "CREATED", label: "Registrado" }];
  if (row.sent_at) items.push({ at: row.sent_at, toStatus: row.accepted_at ? "ACCEPTED" : "SENDING", label: row.accepted_at ? "Aceptado por proveedor" : "Envío intentado" });
  if (row.delivered_at) items.push({ at: row.delivered_at, toStatus: "DELIVERED", label: "Entregado" });
  const last = items[items.length - 1].toStatus;
  if (row.status !== last && !(row.status === "ACCEPTED" && last === "ACCEPTED")) {
    items.push({ at: null, toStatus: row.status, label: `Estado actual: ${SMS_STATUS_LABELS[row.status] || row.status}`, providerDescription: row.provider_description });
  }
  return items.map((item) => ({ fromStatus: null, source: "LEGACY", detail: {}, providerCode: null, providerDescription: null, ...item, reconstructed: true }));
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; // evita inyección de fórmulas
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(typeof c.value === "function" ? c.value(row) : row[c.key])).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
