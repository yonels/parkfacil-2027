import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listInspectorSmsReportRows, inspectorEmailById } from "@/lib/inspector/inspectorRepository";
import { resolveInspectorSmsReportAdminScope } from "@/lib/inspector/inspectorSmsReportAdminScope";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";
import { inspectorCopySmsFromPersistedStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";
import { resolveInspectorSmsReportPeriod, filterInspectorSmsReportRows } from "@/lib/inspector/inspectorSmsReportCore.mjs";

// Reporte SMS Inspector -- vista ADMIN (§2/§3 del pedido de alcance RBAC,
// 2026-09-03): mismo RBAC que el resto del backoffice On Street
// (authorizeOnStreetAdminRequest: platform_admin/company_admin,
// ON_STREET_QR_READ) -- un Inspector (portal distinto, ver comentario en
// /api/inspector/sms-report/route.js) ni siquiera puede autenticar aquí.
// SOLO LECTURA, mismo repositorio que la vista Inspector -- reutilizado, no
// duplicado -- solo cambia el `scope` resuelto server-side
// (resolveInspectorSmsReportAdminScope): company_admin ve su empresa,
// platform_admin ve todo. El filtro "Inspector" SÍ tiene sentido aquí (a
// diferencia del portal Inspector) -- puede haber más de un inspector
// visible.
export async function GET(request) {
  const authorization = await authorizeOnStreetAdminRequest(request);
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "7d";
  const bounds = resolveInspectorSmsReportPeriod(period);
  if (!bounds) return NextResponse.json({ error: "Período no válido." }, { status: 400 });

  try {
    const scope = await resolveInspectorSmsReportAdminScope(authorization.db, authorization.context);
    const [rows, inspectorMap] = await Promise.all([
      listInspectorSmsReportRows(authorization.db, { from: bounds.from, to: bounds.to, scope }),
      inspectorEmailById(authorization.db),
    ]);

    const mapped = rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      plate: row.license_plate_normalized,
      motivo: inspectionMotivoLabel(row),
      phone: row.phone_normalized,
      inspectorEmail: inspectorMap.get(row.inspector_user_id) || "—",
      inspectedAt: row.inspected_at,
      smsRequired: Boolean(row.sms_required),
      smsStatus: row.sms_status,
      smsSentAt: row.sms_sent_at,
      smsProviderMessageId: row.sms_provider_message_id,
      smsDeliveryStatus: row.sms_delivery_status,
      smsDeliveryCheckedAt: row.sms_delivery_checked_at,
      smsDeliveryDescription: row.sms_delivery_description,
      inspectorCopySms: inspectorCopySmsFromPersistedStatus(row.inspector_copy_sms_status),
      inspectorCopySmsSentAt: row.inspector_copy_sms_sent_at,
      inspectorCopySmsProviderMessageId: row.inspector_copy_sms_provider_message_id,
    }));

    const filtered = filterInspectorSmsReportRows(mapped, {
      plate: url.searchParams.get("plate") || "",
      phone: url.searchParams.get("phone") || "",
      sendStatus: url.searchParams.get("sendStatus") || "",
      deliveryStatus: url.searchParams.get("deliveryStatus") || "",
    });

    const inspectorFilter = (url.searchParams.get("inspector") || "").trim().toLowerCase();
    const final = inspectorFilter ? filtered.filter((r) => r.inspectorEmail.toLowerCase().includes(inspectorFilter)) : filtered;

    return NextResponse.json({ data: final, period, bounds, scope: scope.type });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar el reporte SMS." }, { status: 503 });
  }
}
