import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { resendFromHistory } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Reenvío manual: confirmación explícita, un requestId por confirmación
// (doble clic = mismo envío) y registro de auditoría MANUAL_RESEND.
export async function POST(request, { params }) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    const { source, id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await resendFromHistory({ source, sourceId: id, requestId: body?.requestId, acknowledgeDuplicateRisk: body?.acknowledgeDuplicateRisk === true, confirmed: body?.confirmed === true }, authorization.context);
    if (!result) return NextResponse.json({ error: "No se encontró el mensaje.", code: "SMS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: { reused: result.reused, messageId: result.message.id, status: result.message.status, simulated: Boolean(result.message.is_simulated) } });
  } catch (error) {
    return smsErrorResponse(error, "reenviar", "No fue posible reenviar el SMS.");
  }
}
