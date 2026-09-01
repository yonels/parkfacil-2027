import "server-only";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";

// Mismo esqueleto que authorizeRemainingRequest/authorizeOperationRequest
// (autenticación real + requirePermission), sin ningún helper de alcance
// por empresa/estacionamiento: Inspector no tiene ninguno (§3.1 de Etapa
// 2) -- por diseño, esta función nunca toca companyId ni parkingId.
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
    return { context: authorization.context, db: getSupabaseAdminClient(), response: null };
  } catch (error) {
    if (error instanceof AuthorizationError) return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
    throw error;
  }
}
