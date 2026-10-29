import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { revealSmsPhone } from "@/lib/sms/smsCenterRepository";

export const dynamic = "force-dynamic";

// Revela el teléfono completo de un registro (acción auditada: VIEW_FULL_PHONE).
export async function POST(request, { params }) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_PHONE_FULL);
  if (authorization.response) return authorization.response;
  try {
    const { source, id } = await params;
    const result = await revealSmsPhone(source, id, authorization.context);
    if (!result) return NextResponse.json({ error: "No se encontró el mensaje.", code: "SMS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    return smsErrorResponse(error, "telefono", "No fue posible obtener el teléfono.");
  }
}
