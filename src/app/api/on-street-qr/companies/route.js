import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetCompanies } from "@/lib/onStreetAdminRepository";

// Empresas con operación On Street dentro del alcance del usuario
// autenticado — usado para acotar Administradores/Operadores del árbol
// On Street. Para company_admin/operator devuelve como máximo su propia
// empresa (scopedParkings ya lo garantiza server-side).
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await listOnStreetCompanies(auth.db, auth.context) });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_COMPANIES]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar las empresas." }, { status: 503 });
  }
}
