import "server-only";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { ROLES } from "@/lib/auth/permissions.mjs";
import { notificationScopeClauses } from "@/lib/auth/remainingAuthorizationCore.mjs";

export async function authorizeRemainingRequest(request, permission) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    requirePermission(authorization.context, permission);
    return { context: authorization.context, db: getSupabaseAdminClient(), response: null };
  } catch (error) {
    if (error instanceof AuthorizationError) return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
    throw error;
  }
}

export function remainingCompanyScope(context) {
  return context?.role === ROLES.PLATFORM_ADMIN ? null : context?.companyId || null;
}

export function remainingActor(context) {
  return { id: context.userId, companyId: context.companyId, isPlatformAdmin: context.role === ROLES.PLATFORM_ADMIN, isAdmin: context.role !== ROLES.OPERATOR, isSupervisor: false };
}

export async function notificationScope(db, context) {
  if (context.role === ROLES.PLATFORM_ADMIN) return null;
  let parkingIds;
  if (context.role === ROLES.OPERATOR) parkingIds = await assignedParkingIds(db, context);
  else {
    const result = await db.from("parkings").select("id").eq("company_id", context.companyId);
    if (result.error) throw result.error;
    parkingIds = (result.data || []).map((row) => row.id);
  }
  let subscriberQuery = db.from("abonados").select("id").eq("empresa_id", context.companyId);
  if (context.role === ROLES.OPERATOR) subscriberQuery = parkingIds.length ? subscriberQuery.overlaps("estacionamientos", parkingIds) : subscriberQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  const subscriberResult = await subscriberQuery;
  if (subscriberResult.error) throw subscriberResult.error;
  return { parkingIds, subscriberIds: (subscriberResult.data || []).map((row) => row.id), userId: context.userId };
}

export function applyNotificationScope(query, scope) {
  if (!scope) return query;
  return query.or(notificationScopeClauses(scope).join(","));
}

export function remainingAuthorizationError(request, context, error) {
  return error instanceof AuthorizationError ? authorizationErrorResponse(request, error, context) : null;
}
