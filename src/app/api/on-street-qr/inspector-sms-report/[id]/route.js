import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getInspectorSmsReportDetail, inspectorEmailById } from "@/lib/inspector/inspectorRepository";
import { resolveInspectorSmsReportAdminScope } from "@/lib/inspector/inspectorSmsReportAdminScope";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";
import { inspectorCopySmsFromPersistedStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";

// Detalle -- vista ADMIN. Mismo RBAC/scope que el listado (route.js). Un
// company_admin pidiendo el id de una fiscalización de otra empresa recibe
// 404 (getInspectorSmsReportDetail nunca distingue "no existe" de "fuera de
// tu alcance").
export async function GET(request, { params }) {
  const authorization = await authorizeOnStreetAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Fiscalización no válida." }, { status: 400 });

  try {
    const scope = await resolveInspectorSmsReportAdminScope(authorization.db, authorization.context);
    const row = await getInspectorSmsReportDetail(id, authorization.db, scope);
    if (!row) return NextResponse.json({ error: "Fiscalización no encontrada." }, { status: 404 });
    const inspectorMap = await inspectorEmailById(authorization.db);

    return NextResponse.json({
      data: {
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
      },
    });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar el detalle." }, { status: 503 });
  }
}
