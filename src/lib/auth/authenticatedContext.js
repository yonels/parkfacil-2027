import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getRequestPortal } from "@/lib/auth/portal.mjs";
import { AuthorizationError, resolveAuthenticatedContext } from "@/lib/auth/contextCore.mjs";

export const SESSION_COOKIE = "parkfacil_access_token";

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

  return resolveAuthenticatedContext({
    user: data.user,
    portal: getRequestPortal(request),
    loadMembership: async (userId) => {
      const result = await db
        .from("company_members")
        .select("user_id,company_id,full_name,role,status,pos_only,company:companies(id,business_name,trade_name,status,relationship_type)")
        .eq("user_id", userId)
        .maybeSingle();
      if (result.error) throw new AuthorizationError("MEMBERSHIP_LOOKUP_FAILED", 403, "No fue posible validar la membresía.");
      return result.data;
    },
  });
}
