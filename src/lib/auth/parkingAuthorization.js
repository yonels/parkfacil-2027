import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { parkingQueryScope, requireAssignedOperator, requireParkingChildRow } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { ROLES } from "@/lib/auth/permissions.mjs";
import { getParking } from "@/lib/estacionamientosRepository";

export async function assignedParkingIds(db, context) {
  if (context.role !== ROLES.OPERATOR) return null;
  const result = await db.from("company_member_parkings").select("parking_id").eq("user_id", context.userId);
  if (result.error) throw result.error;
  return (result.data || []).map((row) => row.parking_id);
}

export async function authorizeParkingRequest(request, identifier, permission) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    requirePermission(authorization.context, permission);
    const db = getSupabaseAdminClient();
    const assigned = await assignedParkingIds(db, authorization.context);
    const scope = parkingQueryScope(authorization.context, assigned || []);
    const parking = await getParking(db, identifier, scope);
    if (!parking) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el estacionamiento solicitado.", authorization.context);
    return { context: authorization.context, db, parking, response: null };
  } catch (error) {
    if (error instanceof AuthorizationError) return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
    throw error;
  }
}

export async function requireParkingChild(db, context, parking, table, id, parents = {}) {
  let query = db.from(table).select("*").eq("id", id).eq("parking_id", parking.id);
  for (const [column, value] of Object.entries(parents)) query = query.eq(column, value);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  return requireParkingChildRow(context, result.data);
}

export async function requireOperatorForParking(db, context, parking, userId) {
  const [memberResult, accessResult] = await Promise.all([
    db.from("company_members").select("user_id,company_id,role,status").eq("user_id", userId).maybeSingle(),
    db.from("company_member_parkings").select("user_id,parking_id,access_level").eq("user_id", userId).eq("parking_id", parking.id).maybeSingle(),
  ]);
  if (memberResult.error) throw memberResult.error;
  if (accessResult.error) throw accessResult.error;
  return requireAssignedOperator(context, memberResult.data, accessResult.data);
}

export async function requireSupervisorForParking(db, context, parking, userId) {
  if (!userId) return null;
  const memberResult = await db.from("company_members").select("user_id,company_id,role,status").eq("user_id", userId).maybeSingle();
  if (memberResult.error) throw memberResult.error;
  const member = memberResult.data;
  if (!member || member.status !== "active" || member.company_id !== context.companyId) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el supervisor solicitado.", context);
  if (member.role === ROLES.COMPANY_ADMIN) return member;
  return requireOperatorForParking(db, context, parking, userId);
}

export function parkingAuthorizationError(request, context, error) {
  return error instanceof AuthorizationError ? authorizationErrorResponse(request, error, context) : null;
}
