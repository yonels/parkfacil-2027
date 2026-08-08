import { NextResponse } from "next/server";
import { operationalError, validationError } from "@/lib/parkingApi";
import { authorizeOperationRequest, operationAuthorizationError, requireOperationalParking, requireOperationalShift } from "@/lib/auth/operationAuthorization";
import { requireOperatorForParking, requireParkingChild, requireSupervisorForParking } from "@/lib/auth/parkingAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";

const EDITABLE_SHIFT_STATES = ["PROGRAMMED", "OPEN", "CANCELLED"];

export async function PATCH(request, { params }) {
  let authorization;
  try {
    const { id, turnoId } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const input = await request.json();
    const errors = {};
    if (!input.operatorId) errors.operatorId = "Selecciona un operador.";
    if (!input.assignmentId) errors.assignmentId = "Selecciona una asignacion.";
    if (!input.date) errors.date = "La fecha es obligatoria.";
    if (!EDITABLE_SHIFT_STATES.includes(input.status || "PROGRAMMED")) errors.status = "Estado invalido para edición.";
    if (Object.keys(errors).length) return validationError(errors);

    const { db, context } = authorization;
    const parking = await requireOperationalParking(db, context, authorization.scope, id);
    const currentShift = await requireOperationalShift(db, context, authorization.scope, turnoId, parking.id);
    if (["CLOSED", "CLOSING"].includes(currentShift.status)) {
      return NextResponse.json({ error: "Este turno ya no puede modificarse desde esta pantalla.", code: "SHIFT_NOT_EDITABLE" }, { status: 409 });
    }
    if (context.role === ROLES.OPERATOR && input.operatorId !== context.userId) {
      throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "No tienes permiso para modificar turnos de otro operador.", context);
    }
    await requireOperatorForParking(db, context, parking, input.operatorId);
    const assignment = await requireParkingChild(db, context, parking, "operator_assignments", input.assignmentId);
    if (assignment.operator_id !== input.operatorId) {
      throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontro la asignacion solicitada.", context);
    }
    if (input.supervisorId) await requireSupervisorForParking(db, context, parking, input.supervisorId);

    const open = await db.from("operator_shifts").select("id,operator_id,status").eq("operator_id", input.operatorId).in("status", ["OPEN", "CLOSING"]).neq("id", currentShift.id);
    if (open.error) throw open.error;
    if (input.status === "OPEN" && (open.data || []).length) {
      return NextResponse.json({ error: "El operador ya tiene un turno abierto.", code: "OPERATOR_SHIFT_CONFLICT" }, { status: 409 });
    }

    const row = {
      operator_id: input.operatorId,
      assignment_id: assignment.id,
      sector_id: assignment.sector_id,
      street_id: assignment.street_id,
      shift_date: input.date,
      scheduled_start: input.scheduledStart || null,
      scheduled_end: input.scheduledEnd || null,
      status: input.status || "PROGRAMMED",
      supervisor_id: input.supervisorId || null,
      notes: input.notes || "",
      updated_at: new Date().toISOString(),
    };

    const result = await db.from("operator_shifts").update(row).eq("id", currentShift.id).eq("parking_id", parking.id).select("*").single();
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, "No fue posible actualizar el turno.", request, authorization?.context);
  }
}

export async function DELETE(request, { params }) {
  let authorization;
  try {
    const { id, turnoId } = await params;
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const { db, context } = authorization;
    const parking = await requireOperationalParking(db, context, authorization.scope, id);
    const currentShift = await requireOperationalShift(db, context, authorization.scope, turnoId, parking.id);

    if (["OPEN", "CLOSING", "CLOSED"].includes(currentShift.status)) {
      return NextResponse.json({ error: "Este turno no puede eliminarse en su estado actual.", code: "SHIFT_NOT_DELETABLE" }, { status: 409 });
    }

    if (context.role === ROLES.OPERATOR && currentShift.operator_id !== context.userId) {
      throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "No tienes permiso para eliminar turnos de otro operador.", context);
    }

    const result = await db.from("operator_shifts").delete().eq("id", currentShift.id).eq("parking_id", parking.id);
    if (result.error) throw result.error;
    return NextResponse.json({ data: { id: currentShift.id, deleted: true } });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || operationalError(error, "No fue posible eliminar el turno.", request, authorization?.context);
  }
}