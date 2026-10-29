import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { sendDiagnosticTest } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Envío de prueba: solo por acción explícita (nunca al abrir la pantalla), confirmado, a un número autorizado y con espera mínima.
export async function POST(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_TEST_SEND);
  if (authorization.response) return authorization.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await sendDiagnosticTest({ phone: body?.phone, requestId: body?.requestId, confirmed: body?.confirmed === true }, authorization.context);
    return NextResponse.json({ data: result });
  } catch (error) {
    return smsErrorResponse(error, "prueba", "No fue posible ejecutar el envío de prueba.");
  }
}
