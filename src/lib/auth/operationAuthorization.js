import "server-only";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking } from "@/lib/estacionamientosRepository";
import { requireOperationRow, requireOwnShift } from "@/lib/auth/operationAuthorizationCore.mjs";

export async function authorizeOperationRequest(request, permission) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    requirePermission(authorization.context, permission);
    const db = getSupabaseAdminClient();
    const assigned = await assignedParkingIds(db, authorization.context);
    return { context: authorization.context, db, scope: parkingQueryScope(authorization.context, assigned || []), assignedParkingIds: assigned, response: null };
  } catch (error) {
    if (error instanceof AuthorizationError) return { context: authorization.context, response: authorizationErrorResponse(request, error, authorization.context) };
    throw error;
  }
}

export async function requireOperationalParking(db, context, scope, id) {
  return requireOperationRow(context, await getParking(db, id, scope), "estacionamiento");
}

export async function requireOperationalShift(db, context, scope, shiftId, parkingId = null) {
  let query = db.from("operator_shifts").select("*").eq("id", shiftId);
  if (parkingId) query = query.eq("parking_id", parkingId);
  const result = await query.maybeSingle();
  if (result.error) throw result.error;
  const shift = requireOwnShift(context, result.data);
  await requireOperationalParking(db, context, scope, shift.parking_id);
  return shift;
}

export async function requireOperationalClosure(db, context, scope, identifier) {
  const result = await db.from("shift_closures").select("*").or(`id.eq.${identifier},shift_id.eq.${identifier}`).limit(1);
  if (result.error) throw result.error;
  const closure = requireOperationRow(context, result.data?.[0], "cierre");
  await requireOperationalShift(db, context, scope, closure.shift_id);
  return closure;
}

export function operationActor(context) {
  return { id: context.userId, name: context.email || context.userId, role: context.role, companyId: context.companyId, isAdmin: context.role !== "operator" };
}

export function operationAuthorizationError(request, context, error) {
  return error instanceof AuthorizationError ? authorizationErrorResponse(request, error, context) : null;
}
