import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requireCompanyResource, requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { canViewOperatorCredentials } from "@/lib/operatorCredentialCore.mjs";
import { readOperatorCredential } from "@/lib/operatorCredentialServer";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";

// Muestra la clave de un operador al administrador de su empresa (SOL-2026-11-04-004). Es POST
// porque cada lectura deja un registro de auditoría.
export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  const { context } = authorization;
  try {
    requirePermission(context, PERMISSIONS.USER_CREDENTIALS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, context);
  }
  if (!canViewOperatorCredentials(context)) {
    return NextResponse.json({ error: "Solo el administrador de la empresa puede ver las claves.", code: "CREDENTIAL_VIEW_FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  const { data: member, error: memberError } = await db.from("company_members").select("user_id,company_id,role").eq("user_id", id).maybeSingle();
  if (memberError || !member || member.role !== "operator") {
    return NextResponse.json({ error: "No se encontró el operador solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }
  try {
    requireCompanyResource(context, member.company_id);
  } catch (error) {
    return authorizationErrorResponse(request, error, context);
  }

  try {
    const password = await readOperatorCredential(db, { userId: id, companyId: member.company_id, actorId: context.userId });
    if (password === null) {
      return NextResponse.json({ error: "Este operador aún no tiene una clave registrada.", code: "CREDENTIAL_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ data: { password } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[users:credentials:view]", error?.code || "ERROR");
    return NextResponse.json({ error: "No fue posible mostrar la clave.", code: "CREDENTIAL_VIEW_FAILED" }, { status: 500 });
  }
}
