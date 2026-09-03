import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { checkPendingInspectorSmsDeliveries } from "@/lib/inspector/inspectorSmsDeliveryService";

// TAREA 8, "Actualizar pendientes": consulta DLR en lote, solo para
// mensajes SENT sin estado final todavía (listPendingInspectorSmsDeliveryChecks,
// hasta 50 por llamada). Disparada a demanda por el usuario desde el
// reporte -- NO es un cron nuevo (ver TAREA 8 del informe: "no implementar
// cron nuevo sin justificarlo" -- no hay justificación para uno todavía,
// esta acción manual cubre la necesidad actual).
export async function POST(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const scope = { type: "own", inspectorUserId: authorization.context.userId };
    const results = await checkPendingInspectorSmsDeliveries(authorization.db, undefined, undefined, scope);
    return NextResponse.json({ data: { checked: results.length } });
  } catch (cause) {
    if (cause?.code === "PROVIDER_CHECK_STATUS_UNAVAILABLE") {
      return NextResponse.json({ error: "El proveedor SMS activo no soporta consulta de estado de entrega." }, { status: 503 });
    }
    return NextResponse.json({ error: "No fue posible actualizar los pendientes." }, { status: 503 });
  }
}
