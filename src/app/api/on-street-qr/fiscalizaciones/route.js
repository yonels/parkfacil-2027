import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetInspections } from "@/lib/onStreetAdminInspectionsRepository";
import { scopedParkings } from "@/lib/onStreetAdminRepository";

// Fiscalizaciones dentro de la Administración On Street (§20 del brief).
// Mismo RBAC que el resto del módulo (authorizeOnStreetAdminRequest exige
// ON_STREET_QR_READ + rol platform_admin/company_admin) -- un Inspector
// (rol "inspector", solo tiene inspector:use) recibe 403 aquí exactamente
// igual que en /api/on-street-qr/dashboard/overview, sin ningún código
// adicional: es el mismo candado ya existente para todo el módulo.
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const [data, parkings] = await Promise.all([
      listOnStreetInspections(auth.db, auth.context, params),
      scopedParkings(auth.db, auth.context, params.companyId || null),
    ]);
    return NextResponse.json({ data: { ...data, options: { parkings } } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_FISCALIZACIONES]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar las fiscalizaciones." }, { status: 503 });
  }
}
