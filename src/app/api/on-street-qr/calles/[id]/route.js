import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetStreetDetail } from "@/lib/onStreetAdminRepository";

// Ficha nativa On Street de una Calle (§2 de la reorganización 2026-08-28,
// mismo patrón que areas/[id]/route.js). Solo lectura: la escritura
// reutiliza el PATCH ya existente de Off Street a través de
// StructureEntityForm — ver OnStreetStreetDetail.js.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const detail = await getOnStreetStreetDetail(auth.db, auth.context, id);
    if (!detail) return NextResponse.json({ error: "No se encontró la calle solicitada." }, { status: 404 });
    return NextResponse.json({ data: detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "PARKING_NOT_FOUND") return NextResponse.json({ error: "No se encontró la calle solicitada." }, { status: 404 });
    console.error("[ON_STREET_ADMIN_STREET_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar la calle." }, { status: 503 });
  }
}
