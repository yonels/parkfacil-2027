import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { getInspectorActivity, listInspectorUsers } from "@/lib/onStreetAdminInspectionsRepository";

// Ficha de un Inspector: datos de cuenta + su actividad de fiscalización
// (§21 del brief). Lectura disponible para platform_admin/company_admin.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const [inspectors, activity] = await Promise.all([
      listInspectorUsers(auth.db),
      getInspectorActivity(auth.db, id),
    ]);
    const inspector = inspectors.find((i) => i.id === id);
    if (!inspector) return NextResponse.json({ error: "Inspector no encontrado." }, { status: 404 });
    return NextResponse.json({ data: { inspector, activity } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_INSPECTOR_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar el inspector." }, { status: 503 });
  }
}

// Activar/Desactivar (§21): exclusivo de platform_admin -- Inspector no
// pertenece a ninguna empresa (ver ruta hermana), así que administrar la
// cuenta en sí no es un recurso que company_admin deba poder tocar.
// Implementado con auth.admin.updateUserById (ban_duration), el mismo
// mecanismo estándar de Supabase Auth para suspender acceso -- no se crea
// una columna "activo" paralela.
export async function PATCH(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  try {
    requirePlatformAdmin(auth.context);
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(request, error, auth.context);
    throw error;
  }
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 }); }
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Falta el campo 'active'." }, { status: 400 });
  try {
    const result = await auth.db.auth.admin.updateUserById(id, { ban_duration: body.active ? "none" : "876000h" });
    if (result.error) throw result.error;
    return NextResponse.json({ data: { id, active: body.active } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_INSPECTOR_TOGGLE]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible actualizar el estado del inspector." }, { status: 503 });
  }
}
