import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsReadRequest, scopeSmsFilters, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getSmsSummary } from "@/lib/sms/smsCenterRepository";
import { clientSafeSummary, parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Indicadores y series del Resumen general (solo datos reales registrados).
export async function GET(request) {
  const authorization = await authorizeSmsReadRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const filters = scopeSmsFilters(parseSmsFilters(new URL(request.url).searchParams), authorization.companyScope);
    const data = await getSmsSummary(filters);
    return NextResponse.json({ data: authorization.companyScope ? clientSafeSummary(data) : { ...data, viewer: "ROOT" } });
  } catch (error) {
    return smsErrorResponse(error, "resumen", "No fue posible obtener el resumen de SMS.");
  }
}
