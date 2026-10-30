import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsReadRequest, scopeSmsFilters, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { listSmsHistory } from "@/lib/sms/smsCenterRepository";
import { parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Historial paginado y filtrable (teléfono siempre enmascarado en el listado).
export async function GET(request) {
  const authorization = await authorizeSmsReadRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const filters = scopeSmsFilters(parseSmsFilters(new URL(request.url).searchParams), authorization.companyScope);
    const result = await listSmsHistory(filters, authorization.context);
    return NextResponse.json({ data: result });
  } catch (error) {
    return smsErrorResponse(error, "historial", "No fue posible obtener el historial de SMS.");
  }
}
