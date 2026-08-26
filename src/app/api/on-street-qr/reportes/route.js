import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetReport } from "@/lib/onStreetAdminRepository";

// Reportes On Street: consulta histórica exportable (Sesiones/Pagos/
// Ubicaciones/Extensiones). Mismo aislamiento server-side que el resto del
// módulo (getOnStreetReport → fetchOnStreetScopedData → scopedParkings).
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    const data = await getOnStreetReport(auth.db, auth.context, Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_REPORTS]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar el reporte." }, { status: 503 });
  }
}
