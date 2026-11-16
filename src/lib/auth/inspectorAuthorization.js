import "server-only";
import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { buildInspectorCompanyScope } from "@/lib/inspector/inspectorCompanyScopeCore.mjs";

// Alcance por empresa del inspector (SOL-2026-11-16-003, decisión P1):
// estacionamientos On Street de su empresa e inspectores de su empresa. Se
// resuelve aquí, server-side, en cada request -- nunca desde datos del
// cliente.
export async function loadInspectorCompanyScope(db, companyId) {
  if (!companyId) return buildInspectorCompanyScope({ companyId: null });
  const [parkings, inspectors] = await Promise.all([
    db.from("parkings").select("id").eq("company_id", companyId).eq("type", "ON_STREET"),
    db.from("company_members").select("user_id").eq("company_id", companyId).eq("role", ROLES.INSPECTOR),
  ]);
  if (parkings.error) throw parkings.error;
  if (inspectors.error) throw inspectors.error;
  return buildInspectorCompanyScope({
    companyId,
    parkingIds: (parkings.data || []).map((row) => row.id),
    inspectorUserIds: (inspectors.data || []).map((row) => row.user_id),
  });
}

// Mismo esqueleto que authorizeRemainingRequest/authorizeOperationRequest
// (autenticación real + requirePermission). Desde SOL-2026-11-16-003 entrega
// además `scope` con el alcance de la empresa del inspector, que cada ruta
// pasa al repositorio.
export async function authorizeInspectorRequest(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    requirePermission(authorization.context, PERMISSIONS.INSPECTOR_USE);
    // Defensa en profundidad: requirePermission ya basta (INSPECTOR_USE es
    // exclusivo del rol Inspector), pero un chequeo explícito de rol deja la
    // intención inequívoca -- mismo criterio que validatePosOperatorScope
    // en /api/auth/session.
    if (authorization.context.role !== ROLES.INSPECTOR) {
      throw new AuthorizationError("INSPECTOR_ROLE_REQUIRED", 403, "Esta acción requiere una cuenta de Inspector.", authorization.context);
    }
    if (!authorization.context.companyId) {
      throw new AuthorizationError("MEMBERSHIP_INACTIVE", 403, "Tu cuenta de inspector no está asociada a una empresa.", authorization.context);
    }
    const db = getSupabaseAdminClient();
    let scope;
    try {
      scope = await loadInspectorCompanyScope(db, authorization.context.companyId);
    } catch (cause) {
      console.error("[INSPECTOR_SCOPE]", { code: cause?.code || cause?.message });
      return { context: authorization.context, response: NextResponse.json({ error: "No fue posible validar el alcance del inspector." }, { status: 503 }) };
    }
    return { context: authorization.context, db, scope, response: null };
  } catch (error) {
    if (error instanceof AuthorizationError) return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
    throw error;
  }
}
