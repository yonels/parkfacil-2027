import { NextResponse } from "next/server";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { authorizeSmsRequest, smsErrorResponse } from "@/lib/sms/smsApiAuth";
import { checkDiagnosticTest } from "@/lib/sms/smsAdminRepository";

export const dynamic = "force-dynamic";

// Consulta el estado de entrega (smsstatus) del envío de prueba indicado.
export async function POST(request, { params }) {
  const authorization = await authorizeSmsRequest(request, PERMISSIONS.SMS_TEST_SEND);
  if (authorization.response) return authorization.response;
  try {
    const { id } = await params;
    const result = await checkDiagnosticTest(id, authorization.context);
    if (!result) return NextResponse.json({ error: "No se encontró el envío de prueba.", code: "SMS_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: result });
  } catch (error) {
    return smsErrorResponse(error, "prueba-estado", "No fue posible consultar el estado de entrega.");
  }
}
