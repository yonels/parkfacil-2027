import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getSettings, updateSettings } from "@/lib/sms/smsAdminRepository";
import { PERMISSION_MATRIX } from "@/lib/sms/smsAdminCore.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ data: { settings: await getSettings(), permissions: PERMISSION_MATRIX } });
  } catch (error) {
    return smsErrorResponse(error, "configuracion", "No fue posible obtener la configuración.");
  }
}

export async function PUT(request) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ data: await updateSettings(body, authorization.context) });
  } catch (error) {
    return smsErrorResponse(error, "configuracion", "No fue posible guardar la configuración.");
  }
}
