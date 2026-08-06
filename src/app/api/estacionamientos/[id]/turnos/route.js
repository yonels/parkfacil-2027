import { NextResponse } from "next/server";
import { operationalError, validationError } from "@/lib/parkingApi";
import { canOpenShift, SHIFT_STATES } from "@/lib/parkingOperations.mjs";
import { authorizeOperationRequest, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { requireOperatorForParking, requireParkingChild, requireSupervisorForParking } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";

export async function GET(request, { params }) {
  let authorization;
  try {
    const { id } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, id);
    let query = authorization.db.from("operator_shifts").select("*").eq("parking_id", parking.id).order("shift_date", { ascending: false });
    if (authorization.context.role === ROLES.OPERATOR) query = query.eq("operator_id", authorization.context.userId);
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, undefined, request, authorization?.context);
  }
}

export async function POST(request, { params }) {
  let authorization;
  try {
    const { id } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const input = await request.json();
    const errors = {};
    if (!input.operatorId) errors.operatorId = "Selecciona un operador.";
    if (!input.assignmentId) errors.assignmentId = "Selecciona una asignacion.";
    if (!input.date) errors.date = "La fecha es obligatoria.";
    if (!SHIFT_STATES.includes(input.status || "PROGRAMMED")) errors.status = "Estado invalido.";
    if (Object.keys(errors).length) return validationError(errors);
    const { db, context } = authorization;
    const parking = await requireOperationalParking(db, context, authorization.scope, id);
    if (context.role === ROLES.OPERATOR && input.operatorId !== context.userId) throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "No tienes permiso para crear turnos para otro operador.", context);
    await requireOperatorForParking(db, context, parking, input.operatorId);
    const assignment = await requireParkingChild(db, context, parking, "operator_assignments", input.assignmentId);
    if (assignment.operator_id !== input.operatorId) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro la asignacion solicitada.", context);
    if (input.sectorId) await requireParkingChild(db, context, parking, "parking_sectors", input.sectorId);
    if (input.streetId) await requireParkingChild(db, context, parking, "parking_streets", input.streetId, input.sectorId ? { sector_id: input.sectorId } : {});
    if (input.supervisorId) await requireSupervisorForParking(db, context, parking, input.supervisorId);
    const open = await db.from("operator_shifts").select("operator_id,status").eq("operator_id", input.operatorId).in("status", ["OPEN", "CLOSING"]);
    if (open.error) throw open.error;
    if (!canOpenShift((open.data || []).map((item) => ({ operatorId: item.operator_id, status: item.status })), input.operatorId)) return NextResponse.json({ error: "El operador ya tiene un turno abierto.", code: "OPERATOR_SHIFT_CONFLICT" }, { status: 409 });
    const row = { operator_id: input.operatorId, parking_id: parking.id, sector_id: assignment.sector_id, street_id: assignment.street_id, assignment_id: assignment.id, shift_date: input.date, scheduled_start: input.scheduledStart, scheduled_end: input.scheduledEnd, status: input.status || "PROGRAMMED", device_id: input.deviceId || null, supervisor_id: input.supervisorId || null, notes: input.notes || "" };
    const result = await db.from("operator_shifts").insert(row).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, "No fue posible crear el turno.", request, authorization?.context);
  }
}
