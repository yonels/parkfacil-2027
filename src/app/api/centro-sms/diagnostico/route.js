import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getDiagnosticState, runDiagnostic } from "@/lib/sms/smsAdminRepository";
import { providerConfigStatus } from "@/lib/sms/smsAdminCore.mjs";

export const dynamic = "force-dynamic";

// Estado de la integración SIN secretos (solo presencia de variables).
export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_TEST_SEND);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: { config: providerConfigStatus(), ...(await getDiagnosticState()) } });
  } catch (error) {
    return smsErrorResponse(error, "diagnostico", "No fue posible obtener el diagnóstico.");
  }
}

// Ejecuta el diagnóstico: token + bolsa en modo real; nunca envía SMS.
export async function POST(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_TEST_SEND);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: await runDiagnostic(authorization.context) });
  } catch (error) {
    return smsErrorResponse(error, "diagnostico", "No fue posible ejecutar el diagnóstico.");
  }
}
