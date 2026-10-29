import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { getSmsHistoryDetail } from "@/lib/sms/smsCenterRepository";

export const dynamic = "force-dynamic";

// Ficha de un SMS con su línea de tiempo. El teléfono completo se pide aparte
// (POST .../telefono) para que cada revelación quede auditada.
export async function GET(request, { params }) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_READ);
  if (authorization.response) return authorization.response;
  try {
    const { source, id } = await params;
    const detail = await getSmsHistoryDetail(source, id, authorization.context);
    if (!detail) return NextResponse.json({ error: "No se encontró el mensaje.", code: "SMS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: detail });
  } catch (error) {
    return smsErrorResponse(error, "detalle", "No fue posible obtener el detalle del SMS.");
  }
}
