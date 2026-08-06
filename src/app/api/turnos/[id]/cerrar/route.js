import { NextResponse } from "next/server";
import { closeShiftTransaction, getShiftContext, mapClosure } from "@/lib/shiftClosureRepository";
import { OPERATIONAL_SOURCE_ERROR, sanitizeClosureInput, ShiftClosureError } from "@/lib/shiftClosure.mjs";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalShift } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

function failure(request, authorization, error) {
  const denied = operationAuthorizationError(request, authorization?.context, error);
  if (denied) return denied;
  const message = String(error?.message || "");
  if (message.includes("OPERATIONAL_DATA_SOURCE_UNAVAILABLE")) return NextResponse.json({ error: OPERATIONAL_SOURCE_ERROR, code: "OPERATIONAL_DATA_SOURCE_UNAVAILABLE" }, { status: 503 });
  if (message.includes("SHIFT_NOT_CLOSABLE") || message.includes("SHIFT_ALREADY_CLOSED")) return NextResponse.json({ error: "El turno no esta abierto o ya fue cerrado.", code: "SHIFT_NOT_CLOSABLE" }, { status: 409 });
  if (message.includes("SHIFT_FORBIDDEN")) return NextResponse.json({ error: "No tienes autorizacion para cerrar este turno.", code: "SHIFT_FORBIDDEN" }, { status: 403 });
  if (error instanceof ShiftClosureError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "No fue posible cerrar el turno.", code: "SHIFT_CLOSE_FAILED" }, { status: 500 });
}

export async function GET(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const { id } = await params;
    await requireOperationalShift(authorization.db, authorization.context, authorization.scope, id);
    const context = await getShiftContext(id);
    return NextResponse.json({ data: { ...context, operator: { id: context.shift.operatorId }, summary: null, summaryError: { code: "OPERATIONAL_DATA_SOURCE_UNAVAILABLE", message: OPERATIONAL_SOURCE_ERROR } } });
  } catch (error) { return failure(request, authorization, error); }
}

export async function POST(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const { id } = await params;
    await requireOperationalShift(authorization.db, authorization.context, authorization.scope, id);
    const input = sanitizeClosureInput(await request.json());
    const closure = mapClosure(await closeShiftTransaction(id, operationActor(authorization.context), input));
    return NextResponse.json({ data: { turno: { id: closure.shiftId, status: "CLOSED", closedAt: closure.actualCloseAt }, cierre: closure, asignacion: { id: closure.assignmentId, numberFrom: closure.numberFrom, numberTo: closure.numberTo, assignedSpaces: closure.assignedSpaces }, resumenOperacional: { collectedAmount: closure.collectedAmount, paidVehicles: closure.paidVehicles, pendingVehicles: closure.pendingVehicles, cancelledVehicles: closure.cancelledVehicles } } });
  } catch (error) { return failure(request, authorization, error); }
}
