import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { listInspectorSmsReportRows } from "@/lib/inspector/inspectorRepository";
import { inspectionMotivoLabel } from "@/lib/inspector/inspectorPlateStateCore.mjs";
import { inspectorCopySmsFromPersistedStatus } from "@/lib/inspector/inspectorSmsStatusMessage.mjs";
import { resolveInspectorSmsReportPeriod, filterInspectorSmsReportRows } from "@/lib/inspector/inspectorSmsReportCore.mjs";

// Reporte SMS Inspector (2026-09-03; alcance RBAC agregado el mismo día
// tras revisión) -- SOLO LECTURA. Alcance SIEMPRE "own" aquí: esta ruta
// vive en el portal "inspector", y contextCore.resolveAuthenticatedContext
// exige portal==="inspector" exclusivamente para el rol Inspector -- ningún
// otro rol puede autenticar contra esta ruta en absoluto (PORTAL_FORBIDDEN
// antes de llegar aquí), así que "own" (context.userId) no es una opción
// entre varias: es la ÚNICA posible en este archivo. El acceso admin
// (company_admin/platform_admin, con más alcance) vive en una ruta
// SEPARADA bajo /api/on-street-qr/inspector-sms-report, reutilizando
// authorizeOnStreetAdminRequest -- nunca este archivo.
//
// No se consulta inspectorEmailById (la lista completa de inspectores):
// una cuenta Inspector no necesita saber quién más existe -- su propio
// email (context.email) ya identifica todas las filas que puede ver.
export async function GET(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "7d";
  const bounds = resolveInspectorSmsReportPeriod(period);
  if (!bounds) return NextResponse.json({ error: "Período no válido." }, { status: 400 });

  try {
    const scope = { type: "own", inspectorUserId: authorization.context.userId };
    const rows = await listInspectorSmsReportRows(authorization.db, { from: bounds.from, to: bounds.to, scope });

    const mapped = rows.map((row) => ({
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
    }));

    const filtered = filterInspectorSmsReportRows(mapped, {
      plate: url.searchParams.get("plate") || "",
      phone: url.searchParams.get("phone") || "",
      sendStatus: url.searchParams.get("sendStatus") || "",
      deliveryStatus: url.searchParams.get("deliveryStatus") || "",
    });

    return NextResponse.json({ data: filtered, period, bounds });
  } catch {
    return NextResponse.json({ error: "No fue posible cargar el reporte SMS." }, { status: 503 });
  }
}
