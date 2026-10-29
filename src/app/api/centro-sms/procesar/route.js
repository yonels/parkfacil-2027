import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { runSmsProcessor } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Ejecuta a pedido la cola de reintentos y la consulta de entrega del registro central (sin cron autorizado).
export async function POST(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: await runSmsProcessor(authorization.context) });
  } catch (error) {
    return smsErrorResponse(error, "procesar", "No fue posible procesar la cola de SMS.");
  }
}
