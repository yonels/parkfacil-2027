import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { canViewOperatorCredentials, operatorCredentialRows } from "@/lib/operatorCredentialCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listAuthorizedUsers } from "@/lib/usersRepository";

// Lista del reporte de claves (SOL-2026-11-04-004): operadores visibles para quien consulta,
// sin ninguna clave. Cada clave se pide aparte, en /api/usuarios/claves/[id].
export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USER_CREDENTIALS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  try {
    const db = getSupabaseAdminClient();
    const users = await listAuthorizedUsers(db, authorization.context);
    const operatorIds = (users.data || []).filter((user) => user.perfilPrincipal === "operator").map((user) => user.id);
    const credentials = operatorIds.length
      ? await db.from("operator_credentials").select("user_id,updated_at").in("user_id", operatorIds)
      : { data: [], error: null };
    if (credentials.error) throw credentials.error;
    return NextResponse.json({
      data: operatorCredentialRows(users.data || [], credentials.data || []),
      canView: canViewOperatorCredentials(authorization.context),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[users:credentials:list]", error?.code || "ERROR");
    return NextResponse.json({ error: "No fue posible cargar el reporte de claves.", code: "CREDENTIALS_LIST_FAILED" }, { status: 500 });
  }
}
