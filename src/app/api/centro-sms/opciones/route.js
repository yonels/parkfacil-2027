import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { listSmsFilterOptions } from "@/lib/sms/smsCenterRepository";

export const dynamic = "force-dynamic";

// Opciones de los filtros (empresas y establecimientos).
export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: await listSmsFilterOptions() });
  } catch (error) {
    return smsErrorResponse(error, "opciones", "No fue posible obtener las opciones de filtro.");
  }
}
