import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { checkInspectorSmsDelivery } from "@/lib/inspector/inspectorSmsDeliveryService";
import { resolveInspectorSmsReportAdminScope } from "@/lib/inspector/inspectorSmsReportAdminScope";

// "Actualizar estado" -- vista ADMIN. Mismo candado (checkInspectorSmsDelivery
// nunca envía SMS, nunca registra otra fiscalización) que la versión
// Inspector, solo cambia el scope resuelto (empresa/global en vez de "own").
export async function POST(request, { params }) {
  const authorization = await authorizeOnStreetAdminRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Fiscalización no válida." }, { status: 400 });

  try {
    const scope = await resolveInspectorSmsReportAdminScope(authorization.db, authorization.context);
    const result = await checkInspectorSmsDelivery(id, authorization.db, undefined, scope);
    return NextResponse.json({ data: result });
  } catch (cause) {
    const status = Number(cause?.status) || 503;
    const messages = {
      INSPECTION_NOT_FOUND: "Fiscalización no encontrada.",
      SMS_NOT_ACCEPTED_BY_PROVIDER: "Este SMS no fue aceptado por el proveedor -- no hay nada que consultar.",
      PROVIDER_CHECK_STATUS_UNAVAILABLE: "El proveedor SMS activo no soporta consulta de estado de entrega.",
    };
    return NextResponse.json({ error: messages[cause?.code] || "No fue posible consultar el estado de entrega." }, { status: status < 500 ? status : 503 });
  }
}
