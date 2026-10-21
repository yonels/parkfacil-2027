import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { checkPendingInspectorSmsDeliveries } from "@/lib/inspector/inspectorSmsDeliveryService";
import { resolveInspectorSmsReportAdminScope } from "@/lib/inspector/inspectorSmsReportAdminScope";

// "Actualizar pendientes" -- vista ADMIN. Acción a demanda, no un cron
// nuevo (mismo criterio que la versión Inspector). Un company_admin solo
// actualiza pendientes de su propia empresa; platform_admin, de todas.
export async function POST(request) {
  const authorization = await authorizeOnStreetAdminRequest(request);
  if (authorization.response) return authorization.response;

  try {
    const scope = await resolveInspectorSmsReportAdminScope(authorization.db, authorization.context);
    const results = await checkPendingInspectorSmsDeliveries(authorization.db, undefined, undefined, scope);
    return NextResponse.json({ data: { checked: results.length } });
  } catch (cause) {
    if (cause?.code === "PROVIDER_CHECK_STATUS_UNAVAILABLE") {
      return NextResponse.json({ error: "El proveedor SMS activo no soporta consulta de estado de entrega." }, { status: 503 });
    }
    return NextResponse.json({ error: "No fue posible actualizar los pendientes." }, { status: 503 });
  }
}
