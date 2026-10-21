import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetInspectionDetail } from "@/lib/onStreetAdminInspectionsRepository";
import { listInspectionEvidenceWithUrls } from "@/lib/inspector/inspectorEvidenceRepository";

// Evidencia fotográfica desde la Administración (Etapa 3, §32): mismo
// aislamiento por empresa que el detalle de la fiscalización -- se
// reutiliza getOnStreetInspectionDetail exclusivamente para la
// verificación de alcance (404 si la fiscalización no está dentro del
// alcance de quien consulta), nunca una URL pública permanente.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const detail = await getOnStreetInspectionDetail(auth.db, auth.context, id);
    if (!detail) return NextResponse.json({ error: "No se encontró la fiscalización solicitada." }, { status: 404 });
    const data = await listInspectionEvidenceWithUrls(auth.db, id);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_FISCALIZACION_EVIDENCE]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar la evidencia." }, { status: 503 });
  }
}
