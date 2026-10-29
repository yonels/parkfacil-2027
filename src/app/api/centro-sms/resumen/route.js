import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getSmsSummary } from "@/lib/sms/smsCenterRepository";
import { parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Indicadores y series del Resumen general (solo datos reales registrados).
export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const filters = parseSmsFilters(new URL(request.url).searchParams);
    return NextResponse.json({ data: await getSmsSummary(filters) });
  } catch (error) {
    return smsErrorResponse(error, "resumen", "No fue posible obtener el resumen de SMS.");
  }
}
