import "server-only";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { hasPermission, ROLES } from "@/lib/auth/permissions.mjs";
import { assignedParkingIds } from "@/lib/auth/parkingAuthorization";
import { parkingQueryScope } from "@/lib/auth/parkingAuthorizationCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { getParking, listParkings } from "@/lib/estacionamientosRepository";
import { requireOperationRow, requireOwnShift } from "@/lib/auth/operationAuthorizationCore.mjs";
import { chileOperationalDate } from "@/lib/posOperatorShiftService";
import { POS_PARKING_RESOLUTION, resolvePosParking } from "@/lib/pos/posParkingResolution.mjs";
import { extractDisplayUsername } from "@/lib/auth/accessUsernameDomain.mjs";

// `permission` acepta un string (comportamiento histórico, exactamente igual
// que antes vía requirePermission) o un arreglo de permisos alternativos
// (basta con tener uno) -- usado por /api/operacion, donde tanto REPORTS_READ
// (root/company_admin) como OPERATIONS_USE (operador ya expuesto a /operacion
// en navigation.js) deben poder consultar, cada uno con su propio scope real.
export async function authorizeOperationRequest(request, permission) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try {
    if (Array.isArray(permission)) {
      if (!permission.some((item) => hasPermission(authorization.context?.role, item))) {
        throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "No tienes permiso para realizar esta acción.", authorization.context);
      }
    } else {
      requirePermission(authorization.context, permission);
    }
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

const POS_RESOLUTION_SHIFT_FIELDS = "id,operator_id,parking_id,shift_date,scheduled_start,scheduled_end,closed_at,status";

// POS Entry/Exit — Fase 1: único punto que decide QUÉ estacionamiento opera
// una sesión POS (reemplaza assignedParkingIds[0], ver
// src/lib/pos/posParkingResolution.mjs para las reglas y su porqué). Todas
// las APIs POS (/api/pos/* y las solicitudes terminal de /api/data-entry)
// deben pasar por aquí para que entrada, salida, cotización, pagos, turno y
// cierre usen SIEMPRE el mismo estacionamiento. Solo aplica a operadores:
// cualquier otro rol queda UNASSIGNED (mismo resultado que tenía antes en
// /api/pos/*, donde assignedParkingIds es null para no-operadores).
export async function resolvePosOperationalParking(authorization, { now = new Date() } = {}) {
  const { db, context, scope } = authorization;
  if (context?.role !== ROLES.OPERATOR) {
    return { status: POS_PARKING_RESOLUTION.UNASSIGNED, parkingId: null, parking: null, options: [] };
  }

  const today = chileOperationalDate(now);
  const [authorizedParkings, openResult, todayResult] = await Promise.all([
    listParkings(db, scope),
    db.from("operator_shifts").select(POS_RESOLUTION_SHIFT_FIELDS)
      .eq("operator_id", context.userId).in("status", ["OPEN", "CLOSING"]).limit(1).maybeSingle(),
    db.from("operator_shifts").select(POS_RESOLUTION_SHIFT_FIELDS)
      .eq("operator_id", context.userId).eq("shift_date", today).in("status", ["PROGRAMMED", "CLOSED"]),
  ]);
  if (openResult.error) throw openResult.error;
  if (todayResult.error) throw todayResult.error;

  const todayShifts = todayResult.data || [];
  const resolution = resolvePosParking({
    authorizedParkings,
    openShift: openResult.data || null,
    programmedShifts: todayShifts.filter((shift) => shift.status === "PROGRAMMED"),
    closedShifts: todayShifts.filter((shift) => shift.status === "CLOSED"),
  });

  if (resolution.status === POS_PARKING_RESOLUTION.SHIFT_PARKING_FORBIDDEN) {
    throw new AuthorizationError("POS_SHIFT_PARKING_FORBIDDEN", 403, "Tu turno abierto corresponde a un estacionamiento que ya no tienes autorizado. Contacta a tu supervisor.", context);
  }

  const parking = resolution.parkingId ? authorizedParkings.find((item) => item.id === resolution.parkingId) || null : null;
  // authorizedParkings: lista server-side (empresa + asignaciones del
  // operador) — la única contra la que se valida un parkingId elegido para
  // iniciar un turno a pedido (nunca un id del cliente sin validar).
  return { ...resolution, parking, authorizedParkings };
}

export function posParkingSelectionRequiredResponse() {
  return {
    error: "Tienes más de un estacionamiento asignado. Inicia el turno del estacionamiento que vas a operar.",
    code: "PARKING_SELECTION_REQUIRED",
  };
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

// POS Entry/Exit — Fase 1: mismo actor que operationActor, pero con un
// nombre visible apropiado para el operador y el ticket. operationActor usa
// context.email, que en cuentas con "usuario de acceso" es el correo
// técnico interno (@acceso.parkfacilapp.cl) -- no debe mostrarse ni quedar
// impreso como nombre del operador. Se usa el nombre de la membresía
// (company_members.full_name) y, si no existe, solo el usuario de acceso.
// No reemplaza a operationActor en módulos ajenos al POS.
export function posOperationActor(context) {
  const base = operationActor(context);
  const fullName = String(context?.membership?.fullName || "").trim();
  const displayName = fullName || extractDisplayUsername(context?.email) || context?.userId;
  return { ...base, name: displayName };
}

export function operationAuthorizationError(request, context, error) {
  return error instanceof AuthorizationError ? authorizationErrorResponse(request, error, context) : null;
}
