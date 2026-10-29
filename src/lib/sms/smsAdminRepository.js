import "server-only";
import ExcelJS from "exceljs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { prepareResendFromHistory, RESEND_ERROR_MESSAGES, shapeSmsSettings, validateSmsSettings, validateTariff, exportColumns, EXPORT_MAX_ROWS } from "./smsAdminCore.mjs";
import { applyHistoryFilters, shapeHistoryRow, summaryParams, toCsv, HISTORY_SOURCES } from "./smsHistoryCore.mjs";
import { cancelSmsCentral, checkCentralDeliveries, processDueSms, resolveCenterSmsProvider, sendSmsCentral } from "./smsCenterServiceCore.mjs";
import { runProviderDiagnostic, sendTestSms } from "./smsDiagnosticsCore.mjs";
import { listSmsHistory, resolveNamesForExport, smsPermissions } from "./smsCenterRepository";

// Operaciones administrativas del Centro de Control SMS (SOL-2026-10-29-007).
// Cada acción que cambia algo o expone datos queda en sms_admin_audit.

function dbError(error) {
  return Object.assign(new Error("SMS_DB_ERROR"), { code: "SMS_DB_ERROR", cause: error });
}

async function audit(db, context, action, targetType, targetId, detail = {}) {
  const { error } = await db.from("sms_admin_audit").insert({ actor_user_id: context?.userId || null, action, target_type: targetType, target_id: targetId, detail });
  if (error) throw dbError(error);
}

export async function loadSmsSettings(db = getSupabaseAdminClient()) {
  const { data, error } = await db.from("sms_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw dbError(error);
  return data || {};
}

export const FAILURE_STATUSES = ["FAILED", "REJECTED", "EXPIRED", "UNKNOWN"];

export async function getFailures(filters, context, db = getSupabaseAdminClient()) {
  const [{ data: summary, error }, list] = await Promise.all([
    db.rpc("sms_failure_summary", { p: summaryParams(filters) }),
    filters.status ? listSmsHistory(filters, context, db) : listSmsHistory({ ...filters, statusIn: FAILURE_STATUSES }, context, db),
  ]);
  if (error) throw dbError(error);
  return { summary, ...list };
}

export async function resendFromHistory({ source, sourceId, requestId, acknowledgeDuplicateRisk, confirmed }, context, db = getSupabaseAdminClient(), provider = resolveCenterSmsProvider()) {
  if (confirmed !== true) throw Object.assign(new Error("SMS_CONFIRMATION_REQUIRED"), { code: "SMS_CONFIRMATION_REQUIRED", status: 400 });
  if (!/^[A-Za-z0-9-]{8,64}$/.test(String(requestId || ""))) throw Object.assign(new Error("SMS_REQUEST_ID_INVALID"), { code: "SMS_REQUEST_ID_INVALID", status: 400 });
  if (!HISTORY_SOURCES[source] || !/^[0-9a-f-]{36}$/i.test(String(sourceId || ""))) return null;
  const { data: row, error } = await db.from("sms_history_v").select("*").eq("source", source).eq("source_id", sourceId).maybeSingle();
  if (error) throw dbError(error);
  if (!row) return null;
  const prepared = prepareResendFromHistory(row, { acknowledgeDuplicateRisk });
  if (!prepared.ok) throw Object.assign(new Error(prepared.code), { code: `SMS_RESEND_${prepared.code}`, status: 409, userMessage: RESEND_ERROR_MESSAGES[prepared.code] });
  await audit(db, context, "MANUAL_RESEND", source, sourceId, { requestId, previousStatus: row.status, duplicateRisk: prepared.duplicateRisk });
  return sendSmsCentral({
    ...prepared.request,
    originUserId: context?.userId || null,
    idempotencyKey: `resend:${source}:${sourceId}:${requestId}`,
    eventSource: "MANUAL",
  }, { db, provider });
}

export function cancelCentralMessage(messageId, reason, context, db = getSupabaseAdminClient()) {
  return cancelSmsCentral({ messageId, actorUserId: context?.userId || null, reason }, { db });
}

// Ejecución manual del procesador (cola + consulta DLR) mientras no exista
// un cron autorizado. Con proveedor simulado no hay DLR que consultar.
export async function runSmsProcessor(context, db = getSupabaseAdminClient(), provider = resolveCenterSmsProvider()) {
  const processed = await processDueSms({ db, provider, limit: 50 });
  const checked = await checkCentralDeliveries({ db, provider, limit: 50 });
  await audit(db, context, "DIAGNOSTIC_RUN", "processor", null, { processed: processed.length, checked: checked.length, provider: provider.name });
  return { processed: processed.length, checked: checked.length, provider: provider.name };
}

export async function getConsumption(filters, db = getSupabaseAdminClient()) {
  const [{ data, error }, tariffs, lastBalance] = await Promise.all([
    db.rpc("sms_consumption", { p: summaryParams(filters) }),
    listTariffs(db),
    db.from("sms_provider_checks").select("created_at,balance").eq("mode", "REAL").not("balance", "is", null).order("created_at", { ascending: false }).limit(1),
  ]);
  if (error) throw dbError(error);
  if (lastBalance.error) throw dbError(lastBalance.error);
  const companyIds = [...new Set([...(data?.by_company || []), ...(data?.by_parking || [])].map((r) => r.company_id).filter(Boolean))];
  const parkingIds = [...new Set((data?.by_parking || []).map((r) => r.parking_id).filter(Boolean))];
  const [companies, parkings] = await Promise.all([
    companyIds.length ? db.from("companies").select("id,business_name,trade_name").in("id", companyIds) : { data: [] },
    parkingIds.length ? db.from("parkings").select("id,name,code").in("id", parkingIds) : { data: [] },
  ]);
  const companyNames = Object.fromEntries((companies.data || []).map((c) => [c.id, c.trade_name || c.business_name || c.id]));
  const parkingNames = Object.fromEntries((parkings.data || []).map((p) => [p.id, p.code ? `${p.name} (${p.code})` : p.name]));
  return {
    ...data,
    by_company: (data?.by_company || []).map((r) => ({ ...r, name: r.company_id ? companyNames[r.company_id] || r.company_id : "Sin empresa (transversal)" })),
    by_parking: (data?.by_parking || []).map((r) => ({ ...r, name: r.parking_id ? parkingNames[r.parking_id] || "Establecimiento" : "Sin establecimiento", companyName: r.company_id ? companyNames[r.company_id] || r.company_id : "—" })),
    tariffs,
    lastBalance: lastBalance.data?.[0] || null,
  };
}

export async function listTariffs(db = getSupabaseAdminClient()) {
  const { data, error } = await db.from("sms_tariffs").select("*").is("archived_at", null).order("valid_from", { ascending: false });
  if (error) throw dbError(error);
  return data || [];
}

export async function createTariff(input, context, db = getSupabaseAdminClient()) {
  const values = validateTariff(input);
  const { data, error } = await db.from("sms_tariffs").insert({ ...values, created_by: context?.userId || null }).select("*").single();
  if (error) throw dbError(error);
  await audit(db, context, "TARIFF_CREATE", "sms_tariff", data.id, values);
  return data;
}

export async function archiveTariff(id, context, db = getSupabaseAdminClient()) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) return null;
  const { data, error } = await db.from("sms_tariffs").update({ archived_at: new Date().toISOString() }).eq("id", id).is("archived_at", null).select("*").maybeSingle();
  if (error) throw dbError(error);
  if (data) await audit(db, context, "TARIFF_ARCHIVE", "sms_tariff", id, { unit_price: data.unit_price, currency: data.currency });
  return data;
}

export async function getSettings(db = getSupabaseAdminClient()) {
  return shapeSmsSettings(await loadSmsSettings(db));
}

export async function updateSettings(input, context, db = getSupabaseAdminClient()) {
  const values = validateSmsSettings(input);
  const before = await loadSmsSettings(db);
  const { data, error } = await db.from("sms_settings").update({ ...values, updated_at: new Date().toISOString(), updated_by: context?.userId || null }).eq("id", true).select("*").single();
  if (error) throw dbError(error);
  const changed = Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value))
    .map(([key, value]) => [key, key === "test_allowed_phones" ? value.map((p) => `****${p.slice(-4)}`) : value]));
  await audit(db, context, "SETTINGS_UPDATE", "sms_settings", "1", { changed });
  return shapeSmsSettings(data);
}

export async function runRetention(context, db = getSupabaseAdminClient()) {
  const { data, error } = await db.rpc("sms_apply_retention", { p_actor: context?.userId || null });
  if (error) throw dbError(error);
  return data;
}

export async function listInbound(db = getSupabaseAdminClient()) {
  const settings = await loadSmsSettings(db);
  if (!settings.inbound_enabled) return { enabled: false, rows: [] };
  const { data, error } = await db.from("sms_inbound_messages").select("id,received_at,from_phone,body,company_id,attention_status").order("received_at", { ascending: false }).limit(100);
  if (error) throw dbError(error);
  return { enabled: true, rows: (data || []).map((r) => ({ ...r, from_phone: `+56 9 ****${String(r.from_phone).slice(-4)}` })) };
}

// Exportación: mismos filtros que el historial, teléfono enmascarado, hasta
// EXPORT_MAX_ROWS filas; el contenido solo con permiso + pedido explícito.
export async function exportHistory(filters, { format, includeContent }, context, db = getSupabaseAdminClient()) {
  const perms = smsPermissions(context);
  const withContent = Boolean(includeContent && perms.canSeeContent);
  const rows = [];
  for (let start = 0; start < EXPORT_MAX_ROWS; start += 1000) {
    let query = db.from("sms_history_v").select("*");
    query = applyHistoryFilters(query, filters).order("created_at", { ascending: false }).order("source_id").range(start, start + 999);
    const { data, error } = await query;
    if (error) throw dbError(error);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const truncated = rows.length >= EXPORT_MAX_ROWS;
  const names = await resolveNamesForExport(db, rows);
  const shaped = rows.slice(0, EXPORT_MAX_ROWS).map((row) => shapeHistoryRow(row, { canSeeFullPhone: false, canSeeContent: withContent, ...names }));
  const columns = exportColumns({ includeContent: withContent });
  await audit(db, context, "EXPORT", "sms_history", null, { format, rows: shaped.length, truncated, includeContent: withContent, filters: { from: filters.from, to: filters.to, companyId: filters.companyId, module: filters.module, status: filters.status } });
  if (format === "csv") return { body: toCsv(columns, shaped), contentType: "text/csv; charset=utf-8", extension: "csv", truncated };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ParkFacil";
  const sheet = workbook.addWorksheet("Historial SMS");
  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(12, c.label.length + 4)) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3150D8" } };
  for (const row of shaped) sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, typeof c.value === "function" ? c.value(row) : row[c.key] ?? ""])));
  if (truncated) sheet.addRow({ [columns[0].key]: `Exportación limitada a ${EXPORT_MAX_ROWS} filas; acota los filtros para obtener el resto.` });
  return { body: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", truncated };
}

export async function runDiagnostic(context, db = getSupabaseAdminClient()) {
  const result = await runProviderDiagnostic();
  const { config, ...stored } = result;
  const { data, error } = await db.from("sms_provider_checks").insert({ ...stored, actor_user_id: context?.userId || null }).select("*").single();
  if (error) throw dbError(error);
  await audit(db, context, "DIAGNOSTIC_RUN", "sms_provider_check", data.id, { mode: result.mode, auth_ok: result.auth_ok, connectivity_ok: result.connectivity_ok });
  return { ...data, config };
}

export async function getDiagnosticState(db = getSupabaseAdminClient()) {
  const [{ data: checks, error }, settings, tests] = await Promise.all([
    db.from("sms_provider_checks").select("*").order("created_at", { ascending: false }).limit(5),
    loadSmsSettings(db),
    db.from("sms_messages").select("id,created_at,status,is_simulated,provider_message_id,provider_code,provider_description,error_code,phone_last4,accepted_at,delivered_at")
      .eq("module", "DIAGNOSTIC").order("created_at", { ascending: false }).limit(10),
  ]);
  if (error) throw dbError(error);
  if (tests.error) throw dbError(tests.error);
  return {
    checks: checks || [],
    tests: tests.data || [],
    testAllowedPhones: (settings.test_allowed_phones || []).map((p) => ({ value: p, label: `+56 9 ****${p.slice(-4)}` })),
    cooldownSeconds: settings.test_send_cooldown_seconds,
  };
}

export async function sendDiagnosticTest(input, context, db = getSupabaseAdminClient(), provider = resolveCenterSmsProvider()) {
  const settings = await loadSmsSettings(db);
  return sendTestSms({ ...input, actorUserId: context?.userId || null }, { db, provider, settings });
}

export async function checkDiagnosticTest(messageId, context, db = getSupabaseAdminClient(), provider = resolveCenterSmsProvider()) {
  if (!/^[0-9a-f-]{36}$/i.test(String(messageId || ""))) return null;
  const { data: row, error } = await db.from("sms_messages").select("id,module,status,is_simulated").eq("id", messageId).maybeSingle();
  if (error) throw dbError(error);
  if (!row || row.module !== "DIAGNOSTIC") return null;
  if (row.is_simulated) return { ...row, note: "Envío simulado: no existe estado de entrega real que consultar." };
  await checkCentralDeliveries({ db, provider, messageId, limit: 1 });
  const { data: updated, error: updatedError } = await db.from("sms_messages").select("id,status,provider_code,provider_description,delivered_at,last_status_check_at").eq("id", messageId).single();
  if (updatedError) throw dbError(updatedError);
  return updated;
}
