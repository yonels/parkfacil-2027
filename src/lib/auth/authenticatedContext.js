import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getRequestPortal } from "@/lib/auth/portal.mjs";
import { AuthorizationError, resolveAuthenticatedContext } from "@/lib/auth/contextCore.mjs";
import { verifyImpersonationCookie } from "@/lib/auth/impersonationCore.mjs";

export const SESSION_COOKIE = "parkfacil_access_token";
// Cookie de impersonación Root -> Cliente: guarda EXCLUSIVAMENTE el
// company_id elegido. No es, por sí sola, ninguna prueba de identidad --
// el límite de seguridad real es que solo tiene efecto cuando el token de
// Supabase de esta misma solicitud (SESSION_COOKIE, re-verificado abajo
// vía db.auth.getUser en cada request) resuelve a platform_admin. Un
// company_admin/operator real nunca entra a esa rama en contextCore.mjs,
// sin importar qué value tenga esta cookie -- ver impersonationCore.mjs.
export const IMPERSONATION_COOKIE = "parkfacil_impersonation";

function cookieValue(request, name) {
  const direct = request?.cookies?.get?.(name)?.value;
  if (direct) return direct;
  const cookies = request?.headers?.get?.("cookie") || "";
  const match = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export function getRequestAccessToken(request) {
  const authorization = request?.headers?.get?.("authorization") || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return cookieValue(request, SESSION_COOKIE);
}

export async function getAuthenticatedContext(request) {
  const token = getRequestAccessToken(request);
  if (!token) throw new AuthorizationError("AUTH_REQUIRED", 401, "Debes iniciar sesión.");

  const db = getSupabaseAdminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new AuthorizationError("AUTH_REQUIRED", 401, "La sesión no es válida.");

  // La cookie solo tiene efecto si su firma HMAC es válida PARA ESTE
  // MISMO usuario real (data.user.id, ya confirmado arriba por
  // db.auth.getUser) -- nunca se confía en su contenido crudo. Si el
  // secreto no está configurado, o la firma no valida (manipulada,
  // vencida, o firmada para otro usuario), se trata exactamente igual
  // que "sin impersonación" -- nunca un error que delate el motivo
  // exacto al cliente.
  const rawImpersonationCookie = cookieValue(request, IMPERSONATION_COOKIE);
  let impersonatedCompanyId = null;
  if (rawImpersonationCookie) {
    try {
      const verified = verifyImpersonationCookie({
        secret: process.env.IMPERSONATION_HMAC_SECRET,
        rootUserId: data.user.id,
        cookieValue: rawImpersonationCookie,
      });
      if (verified.ok) impersonatedCompanyId = verified.companyId;
    } catch (secretError) {
      console.error("[impersonation:cookie-verify]", secretError?.message);
    }
  }

  return resolveAuthenticatedContext({
    user: data.user,
    portal: getRequestPortal(request),
    impersonatedCompanyId,
    loadMembership: async (userId) => {
      const result = await db
        .from("company_members")
        .select("user_id,company_id,full_name,role,status,pos_only,product_scope,access_expires_at,company:companies(id,business_name,trade_name,status,relationship_type,enabled_products)")
        .eq("user_id", userId)
        .maybeSingle();
      if (result.error) throw new AuthorizationError("MEMBERSHIP_LOOKUP_FAILED", 403, "No fue posible validar la membresía.");
      return result.data;
    },
    // Solo se invoca cuando metadataRole ya fue verificado como
    // platform_admin (ver contextCore.mjs) -- nunca para una sesión real
    // de company_admin/operator.
    loadCompany: impersonatedCompanyId
      ? async (companyId) => {
          const result = await db
            .from("companies")
            .select("id,business_name,trade_name,status,relationship_type,enabled_products")
            .eq("id", companyId)
            .maybeSingle();
          if (result.error) throw new AuthorizationError("COMPANY_LOOKUP_FAILED", 403, "No fue posible validar la empresa impersonada.");
          return result.data;
        }
      : undefined,
  });
}
