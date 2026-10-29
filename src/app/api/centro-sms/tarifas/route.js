import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { createTariff, listTariffs } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: await listTariffs() });
  } catch (error) {
    return smsErrorResponse(error, "tarifas", "No fue posible obtener las tarifas.");
  }
}

// Tarifa INTERNA (nunca se presenta como valor informado por Sentraland).
export async function POST(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ data: await createTariff(body, authorization.context) }, { status: 201 });
  } catch (error) {
    return smsErrorResponse(error, "tarifas", "No fue posible guardar la tarifa.");
  }
}
