import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsReadRequest, scopeSmsFilters, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getConsumption } from "@/lib/sms/smsAdminRepository";
import { clientSafeConsumption, parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Consumo real (aceptados no simulados) y costo con tarifas internas.
export async function GET(request) {
  const authorization = await authorizeSmsReadRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const params = new URL(request.url).searchParams;
    if (!params.get("agrupar")) params.set("agrupar", "month");
    const data = await getConsumption(scopeSmsFilters(parseSmsFilters(params), authorization.companyScope));
    return NextResponse.json({ data: authorization.companyScope ? clientSafeConsumption(data) : { ...data, viewer: "ROOT" } });
  } catch (error) {
    return smsErrorResponse(error, "consumo", "No fue posible obtener el consumo.");
  }
}
