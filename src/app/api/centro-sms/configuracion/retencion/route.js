import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { runRetention } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Aplica la retención: anonimiza teléfono y texto de mensajes antiguos (auditado).
export async function POST(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirmed !== true) return NextResponse.json({ error: "Debes confirmar explícitamente la operación.", code: "SMS_CONFIRMATION_REQUIRED" }, { status: 400 });
    return NextResponse.json({ data: await runRetention(authorization.context) });
  } catch (error) {
    return smsErrorResponse(error, "retencion", "No fue posible aplicar la retención.");
  }
}
