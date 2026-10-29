import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { archiveTariff } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Archiva (no borra) una tarifa interna; queda auditado.
export async function DELETE(request, { params }) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_MANAGE);
  if (authorization.response) return authorization.response;
  try {
    const { id } = await params;
    const archived = await archiveTariff(id, authorization.context);
    if (!archived) return NextResponse.json({ error: "No se encontró la tarifa.", code: "SMS_TARIFF_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: archived });
  } catch (error) {
    return smsErrorResponse(error, "tarifas", "No fue posible archivar la tarifa.");
  }
}
