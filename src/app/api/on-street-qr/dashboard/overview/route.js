import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { getOnStreetDashboardOverview } from "@/lib/onStreetAdminRepository";

// Dashboard On Street enriquecido (KPIs, series, ranking de ubicaciones,
// alertas). Mismo esquema de autorización que /api/on-street-qr/dashboard —
// getOnStreetDashboardOverview aplica el aislamiento por empresa
// server-side (scopedParkings), el companyId recibido aquí solo tiene
// efecto si el rol autenticado es platform_admin.
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    const data = await getOnStreetDashboardOverview(auth.db, auth.context, Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_DASHBOARD_OVERVIEW]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar el dashboard." }, { status: 503 });
  }
}
