import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { getInspectorSmsReportDetail } from "@/lib/inspector/inspectorRepository";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";
import { inspectorCopySmsFromPersistedStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";

// TAREA 7 + alcance RBAC (mismo criterio que route.js del listado): SOLO
// LECTURA, alcance SIEMPRE "own" -- esta ruta vive en el portal
// "inspector", inalcanzable para cualquier otro rol (ver comentario en
// ../route.js). Un inspector A pidiendo el id de una fiscalización de
// inspector B recibe 404 (getInspectorSmsReportDetail nunca distingue "no
// existe" de "no es tuya"), exactamente igual que
// getInspectorInspectionById.
export async function GET(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Fiscalización no válida." }, { status: 400 });

  try {
    const scope = { type: "own", inspectorUserId: authorization.context.userId };
    const row = await getInspectorSmsReportDetail(id, authorization.db, scope);
    if (!row) return NextResponse.json({ error: "Fiscalización no encontrada." }, { status: 404 });

    return NextResponse.json({
      data: {
        id: row.id,
        sessionId: row.session_id,
        plate: row.license_plate_normalized,
        motivo: inspectionMotivoLabel(row),
        phone: row.phone_normalized,
        inspectorEmail: authorization.context.email,
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
