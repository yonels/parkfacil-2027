import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { checkInspectorSmsDelivery } from "@/lib/inspector/inspectorSmsDeliveryService";

// TAREA 8, "Actualizar estado": consulta DLR para UNA fiscalización.
// checkInspectorSmsDelivery (inspectorSmsDeliveryService.js) es la única
// lógica real -- esta ruta solo autentica y traduce errores. NUNCA envía un
// SMS, NUNCA registra otra fiscalización, NUNCA toca sms_status/sms_sent_at/
// sms_provider_message_id -- solo persiste las 3 columnas de entrega.
export async function POST(request, { params }) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Fiscalización no válida." }, { status: 400 });

  try {
    const scope = { type: "own", inspectorUserId: authorization.context.userId };
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
