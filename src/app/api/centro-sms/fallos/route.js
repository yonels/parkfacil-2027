import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getFailures } from "@/lib/sms/smsAdminRepository";
import { parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Fallos por categoría + mensajes fallidos, rechazados, expirados o desconocidos.
export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const filters = parseSmsFilters(new URL(request.url).searchParams);
    return NextResponse.json({ data: await getFailures(filters, authorization.context) });
  } catch (error) {
    return smsErrorResponse(error, "fallos", "No fue posible obtener los fallos.");
  }
}
