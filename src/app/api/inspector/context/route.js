import { NextResponse } from "next/server";
import { authorizeInspectorRequest } from "@/lib/auth/inspectorAuthorization";
import { listInspectorContextOptions } from "@/lib/inspector/inspectorRepository";

// Opciones de contexto territorial para el Inspector (Etapa 3, §13/§14):
// jerarquía real Estacionamiento->Área->Calle->Tramo, sin ningún recorte por
// empresa (consulta global preservada, ver authorizeInspectorRequest -- sin
// companyId/parkingId por diseño). Solo lectura.
export async function GET(request) {
  const authorization = await authorizeInspectorRequest(request);
  if (authorization.response) return authorization.response;
  try {
    const data = await listInspectorContextOptions(authorization.db);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[INSPECTOR_CONTEXT_OPTIONS]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar las opciones de contexto." }, { status: 503 });
  }
}
