import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { EMPTY_UUID, requireSubscriberParking, requireSubscriberRow, subscriberQueryScope } from "@/lib/auth/subscriberAuthorizationCore.mjs";

export function applySubscriberScope(query, scope = {}) {
  let scoped = query;
  if (scope.companyId) scoped = scoped.eq("empresa_id", scope.companyId);
  if (scope.parkingIds) scoped = scope.parkingIds.length ? scoped.overlaps("estacionamientos", scope.parkingIds) : scoped.eq("id", EMPTY_UUID);
  return scoped;
}

export async function authorizeSubscriberRequest(request, permission) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    requirePermission(authorization.context, permission);
    const db = getSupabaseAdminClient();
    const assigned = await assignedParkingIds(db, authorization.context);
    return { context: authorization.context, db, scope: subscriberQueryScope(authorization.context, assigned || []), response: null };
  } catch (error) {
    if (error instanceof AuthorizationError) return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
    throw error;
  }
}

export async function requireSubscriber(db, context, scope, id) {
  const result = await applySubscriberScope(db.from("abonados").select("*"), scope).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return requireSubscriberRow(context, result.data);
}

export async function requireSubscriberParkingId(db, context, companyId, parkingId) {
  if (!parkingId) return null;
  let query = db.from("parkings").select("id,company_id,status").eq("id", parkingId);
  if (companyId) query = query.eq("company_id", companyId);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return requireSubscriberParking(context, result.data, companyId);
}

export async function requireActiveClientCompany(db, context, companyId) {
  if (!companyId) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro la empresa solicitada.", context);
  const result = await db.from("companies").select("id,status,relationship_type").eq("id", companyId).eq("status", "active").eq("relationship_type", "client").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro la empresa solicitada.", context);
  return result.data;
}

export function subscriberAuthorizationError(request, context, error) {
  return error instanceof AuthorizationError ? authorizationErrorResponse(request, error, context) : null;
}
