import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsReadRequest, scopeSmsFilters, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { listSmsFilterOptions } from "@/lib/sms/smsCenterRepository";

export const dynamic = "force-dynamic";

// Opciones de los filtros (empresas y establecimientos).
export async function GET(request) {
  const authorization = await authorizeSmsReadRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: await listSmsFilterOptions(undefined, authorization.companyScope) });
  } catch (error) {
    return smsErrorResponse(error, "opciones", "No fue posible obtener las opciones de filtro.");
  }
}
