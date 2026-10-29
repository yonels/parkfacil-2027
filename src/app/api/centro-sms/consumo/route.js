import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getConsumption } from "@/lib/sms/smsAdminRepository";
import { parseSmsFilters } from "@/lib/sms/smsHistoryCore.mjs";

export const dynamic = "force-dynamic";

// Consumo real (aceptados no simulados) y costo con tarifas internas.
export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const params = new URL(request.url).searchParams;
    if (!params.get("agrupar")) params.set("agrupar", "month");
    return NextResponse.json({ data: await getConsumption(parseSmsFilters(params)) });
  } catch (error) {
    return smsErrorResponse(error, "consumo", "No fue posible obtener el consumo.");
  }
}
