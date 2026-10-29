import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { listInbound } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Bandeja de entrada: deshabilitada mientras Sentraland no ofrezca recepción.
export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: await listInbound() });
  } catch (error) {
    return smsErrorResponse(error, "recibidos", "No fue posible obtener los mensajes recibidos.");
  }
}
