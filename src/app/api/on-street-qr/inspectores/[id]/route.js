import { NextResponse } from "next/server";
import { authorizeOnStreetAdminRequest } from "@/lib/onStreetAdminAuthorization";
import { companyScope, requireCompanyResource } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { getInspectorActivity, listInspectorUsers } from "@/lib/onStreetAdminInspectionsRepository";

// Ficha de un Inspector: datos de cuenta + su actividad de fiscalización
// (§21 del brief). company_admin solo ve los inspectores de su empresa
// (SOL-2026-11-16-003); un inspector de otra empresa responde 404.
export async function GET(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const inspectors = await listInspectorUsers(auth.db, { companyId: companyScope(auth.context) });
    const inspector = inspectors.find((i) => i.id === id);
    if (!inspector) return NextResponse.json({ error: "Inspector no encontrado." }, { status: 404 });
    const activity = await getInspectorActivity(auth.db, id);
    return NextResponse.json({ data: { inspector, activity } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_INSPECTOR_DETAIL]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible cargar el inspector." }, { status: 503 });
  }
}

// Activar/Desactivar: Root, o el administrador de la empresa del inspector
// (SOL-2026-11-16-003). El estado vive en company_members.status, igual que
// en el Catálogo de usuarios; al activar se quita además cualquier bloqueo
// antiguo de Auth (ban_duration) de cuando el estado se guardaba ahí.
export async function PATCH(request, { params }) {
  const auth = await authorizeOnStreetAdminRequest(request);
  if (auth.response) return auth.response;
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 }); }
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Falta el campo 'active'." }, { status: 400 });

  const member = await auth.db.from("company_members").select("user_id,company_id,role").eq("user_id", id).maybeSingle();
  if (member.error || !member.data || member.data.role !== "inspector") {
    return NextResponse.json({ error: "Inspector no encontrado." }, { status: 404 });
  }
  try {
    requireCompanyResource(auth.context, member.data.company_id);
  } catch (error) {
    if (error instanceof AuthorizationError) return authorizationErrorResponse(request, error, auth.context);
    throw error;
  }
  try {
    const updated = await auth.db.from("company_members")
      .update({ status: body.active ? "active" : "inactive", updated_at: new Date().toISOString() })
      .eq("user_id", id);
    if (updated.error) throw updated.error;
    if (body.active) {
      const unbanned = await auth.db.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (unbanned.error) throw unbanned.error;
    }
    return NextResponse.json({ data: { id, active: body.active } });
  } catch (error) {
    console.error("[ON_STREET_ADMIN_INSPECTOR_TOGGLE]", { code: error.code || error.message });
    return NextResponse.json({ error: "No fue posible actualizar el estado del inspector." }, { status: 503 });
  }
}
