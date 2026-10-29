import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { applyHistoryFilters, buildTimeline, deliveryRate, HISTORY_SOURCES, shapeHistoryRow, summaryParams } from "./smsHistoryCore.mjs";

// Lecturas del Centro de Control SMS (SOL-2026-10-29-007). Todas pasan por
// sms_history_v / funciones sms_* con service_role; la autorización (solo
// Root por ahora) se aplica en las rutas API antes de llegar aquí.

function dbError(error) {
  return Object.assign(new Error("SMS_DB_ERROR"), { code: "SMS_DB_ERROR", cause: error });
}

// En listados y fichas el teléfono SIEMPRE va enmascarado; quien tenga
// sms:phone:full lo revela uno a uno con revealSmsPhone (queda auditado).
export function smsPermissions(context) {
  return {
    canSeeFullPhone: false,
    canRevealPhone: hasPermission(context?.role, PERMISSIONS.SMS_PHONE_FULL),
    canSeeContent: hasPermission(context?.role, PERMISSIONS.SMS_CONTENT_READ),
  };
}

export async function resolveNamesForExport(db, rows) {
  return resolveNames(db, rows);
}

async function resolveNames(db, rows) {
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  const parkingIds = [...new Set(rows.map((r) => r.parking_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.origin_user_id).filter(Boolean))];
  const [companies, parkings, users] = await Promise.all([
    companyIds.length ? db.from("companies").select("id,business_name,trade_name").in("id", companyIds) : { data: [] },
    parkingIds.length ? db.from("parkings").select("id,name,code").in("id", parkingIds) : { data: [] },
    userIds.length ? db.rpc("sms_user_labels", { p_ids: userIds }) : { data: [] },
  ]);
  for (const result of [companies, parkings, users]) if (result.error) throw dbError(result.error);
  return {
    companies: Object.fromEntries((companies.data || []).map((c) => [c.id, c.trade_name || c.business_name || c.id])),
    parkings: Object.fromEntries((parkings.data || []).map((p) => [p.id, p.code ? `${p.name} (${p.code})` : p.name])),
    users: Object.fromEntries((users.data || []).map((u) => [u.user_id, u.label])),
  };
}

export async function getSmsSummary(filters, db = getSupabaseAdminClient()) {
  const { data, error } = await db.rpc("sms_dashboard_summary", { p: summaryParams(filters) });
  if (error) throw dbError(error);
  return { ...data, deliveryRate: deliveryRate(data?.kpis), filters: { from: filters.from, to: filters.to, bucket: filters.bucket, includeSimulated: filters.includeSimulated } };
}

export async function listSmsHistory(filters, context, db = getSupabaseAdminClient()) {
  const start = (filters.page - 1) * filters.pageSize;
  let query = db.from("sms_history_v").select("*", { count: "exact" });
  query = applyHistoryFilters(query, filters)
    .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
    .order("source_id", { ascending: true })
    .range(start, start + filters.pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  const names = await resolveNames(db, data || []);
  const perms = smsPermissions(context);
  return {
    rows: (data || []).map((row) => shapeHistoryRow(row, { ...perms, ...names })),
    total: count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

async function loadHistoryRow(db, source, sourceId) {
  if (!HISTORY_SOURCES[source] || !/^[0-9a-f-]{36}$/i.test(String(sourceId || ""))) return null;
  const { data, error } = await db.from("sms_history_v").select("*").eq("source", source).eq("source_id", sourceId).maybeSingle();
  if (error) throw dbError(error);
  return data;
}

export async function getSmsHistoryDetail(source, sourceId, context, db = getSupabaseAdminClient()) {
  const row = await loadHistoryRow(db, source, sourceId);
  if (!row) return null;
  let events = [];
  let related = [];
  if (row.source === "CENTRAL") {
    const [eventsResult, relatedResult] = await Promise.all([
      db.from("sms_message_events").select("created_at,from_status,to_status,source,provider_code,provider_description,detail").eq("message_id", row.message_id).order("created_at"),
      db.from("sms_messages").select("id,status,created_at,attempts").eq("root_message_id", row.root_message_id || row.message_id).order("created_at"),
    ]);
    if (eventsResult.error) throw dbError(eventsResult.error);
    if (relatedResult.error) throw dbError(relatedResult.error);
    events = eventsResult.data || [];
    related = (relatedResult.data || []).filter((m) => m.id !== row.message_id);
  }
  const names = await resolveNames(db, [row]);
  const perms = smsPermissions(context);
  return {
    permissions: { canRevealPhone: perms.canRevealPhone, canSeeContent: perms.canSeeContent },
    message: shapeHistoryRow(row, { ...perms, ...names }),
    timeline: buildTimeline(row, events),
    related,
  };
}

// Revela el teléfono completo de un registro y lo deja auditado.
export async function revealSmsPhone(source, sourceId, context, db = getSupabaseAdminClient()) {
  const row = await loadHistoryRow(db, source, sourceId);
  if (!row) return null;
  const { error } = await db.from("sms_admin_audit").insert({
    actor_user_id: context?.userId || null,
    action: "VIEW_FULL_PHONE",
    target_type: source,
    target_id: sourceId,
    detail: {},
  });
  if (error) throw dbError(error);
  return { phone: row.phone_normalized || null };
}

export async function listSmsFilterOptions(db = getSupabaseAdminClient()) {
  const [companies, parkings] = await Promise.all([
    db.from("companies").select("id,business_name,trade_name").order("business_name"),
    db.from("parkings").select("id,name,code,company_id").order("name"),
  ]);
  if (companies.error) throw dbError(companies.error);
  if (parkings.error) throw dbError(parkings.error);
  return {
    companies: (companies.data || []).map((c) => ({ id: c.id, name: c.trade_name || c.business_name || c.id })),
    parkings: (parkings.data || []).map((p) => ({ id: p.id, name: p.code ? `${p.name} (${p.code})` : p.name, companyId: p.company_id })),
  };
}
