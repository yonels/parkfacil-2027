import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { listOnStreetProjects } from "@/lib/onStreetAdminRepository";

// Proyectos On Street ("Proyectos actuales"): un Proyecto = un
// Estacionamiento (parkings.type='ON_STREET') accesible por el usuario, en
// CUALQUIER estado real (corrección 2026-08-30 -- antes exigía
// status='ACTIVE' siempre, lo que ocultaba todo Proyecto recién creado,
// nace DRAFT). ?status= es opcional y filtra a un estado exacto. Mismo RBAC
// que el resto de la administración On Street.
export async function GET(request) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const data = await listOnStreetProjects(auth.db, auth.context, params);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_PROJECTS]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar los proyectos." }, { status: 503 });
  }
}
