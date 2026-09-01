import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetAreaDetail } from "@/lib/onStreetAdminRepository";

// Ficha nativa On Street de un Área (§3 de la reorganización 2026-08-28).
// Solo lectura: la escritura reutiliza el PATCH ya existente de Off Street
// (/api/estacionamientos/[id]/sectores/[sectorId]) a través de
// StructureEntityForm — ver OnStreetAreaDetail.js.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const detail = await getOnStreetAreaDetail(auth.db, auth.context, id);
    if (!detail) return NextResponse.json({ error: "No se encontró el área solicitada." }, { status: 404 });
    return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "PARKING_NOT_FOUND") return NextResponse.json({ error: "No se encontró el área solicitada." }, { status: 404 });
    console.error("[ON_STREET_ADMIN_AREA_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar el área." }, { status: 503 });
  }
}
