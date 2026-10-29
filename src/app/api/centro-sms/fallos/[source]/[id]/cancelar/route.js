import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { cancelCentralMessage } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Cancela un mensaje del registro central que sigue en cola (auditado).
export async function POST(request, { params }) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    const { source, id } = await params;
    if (source !== "CENTRAL" || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Solo se cancelan mensajes del registro central.", code: "SMS_CANCEL_NOT_ALLOWED" }, { status: 409 });
    const body = await request.json().catch(() => ({}));
    if (body?.confirmed !== true) return NextResponse.json({ error: "Debes confirmar explícitamente la operación.", code: "SMS_CONFIRMATION_REQUIRED" }, { status: 400 });
    const message = await cancelCentralMessage(id, body?.reason, authorization.context);
    return NextResponse.json({ data: { id: message.id, status: message.status } });
  } catch (error) {
    return smsErrorResponse(error, "cancelar", "No fue posible cancelar el SMS.");
  }
}
