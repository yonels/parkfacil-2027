import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetProjectDetail } from "@/lib/onStreetAdminRepository";

// Ficha de Proyecto On Street (Resumen). Mismo RBAC/aislamiento por
// empresa que el resto de la administración On Street.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const detail = await getOnStreetProjectDetail(auth.db, auth.context, id);
    if (!detail) return NextResponse.json({ error: "No se encontró el proyecto solicitado." }, { status: 404 });
    return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "PARKING_NOT_FOUND") return NextResponse.json({ error: "No se encontró el proyecto solicitado." }, { status: 404 });
    console.error("[ON_STREET_ADMIN_PROJECT_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar el proyecto." }, { status: 503 });
  }
}
