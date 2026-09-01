import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetInspectionDetail } from "@/lib/onStreetAdminInspectionsRepository";

// Detalle READ ONLY de una fiscalización (Etapa 3, §31). Mismo RBAC que el
// listado -- ver getOnStreetInspectionDetail para el aislamiento por
// empresa.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const detail = await getOnStreetInspectionDetail(auth.db, auth.context, id);
    if (!detail) return NextResponse.json({ error: "No se encontró la fiscalización solicitada." }, { status: 404 });
    return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_FISCALIZACION_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar la fiscalización." }, { status: 503 });
  }
}
