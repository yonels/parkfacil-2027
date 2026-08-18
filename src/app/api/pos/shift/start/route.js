import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getPosOperatorShiftState, startPosOperatorShift } from "@/lib/posOperatorShiftService";

const errors = {
  SHIFT_NOT_FOUND: ["No se encontró el turno asignado.", 404], SHIFT_FORBIDDEN: ["No tienes autorización para iniciar este turno.", 403],
  SHIFT_NOT_PROGRAMMED: ["El turno ya no está disponible para iniciar.", 409], OPERATOR_SHIFT_CONFLICT: ["Ya existe otro turno abierto para el operador.", 409],
  SHIFT_START_CONFLICT: ["El turno cambió mientras se intentaba iniciar. Actualiza e inténtalo nuevamente.", 409],
  PARKING_NOT_ACTIVE: ["El estacionamiento del turno no está activo.", 409], ON_STREET_ASSIGNMENT_REQUIRED: ["El turno on-street no tiene una asignación operacional válida.", 409],
};
function rpcFailure(error) {
  const message = String(error?.message || "");
  for (const [code, [text, status]] of Object.entries(errors)) if (message.includes(code)) return NextResponse.json({ error: text, code }, { status });
  console.error("[POS_SHIFT_START]", { code: error?.code || "POS_SHIFT_START_FAILED", message: error?.message });
  return NextResponse.json({ error: "No fue posible iniciar el turno.", code: "POS_SHIFT_START_FAILED" }, { status: 500 });
}
export async function POST(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const parkingId = authorization.assignedParkingIds?.[0] || null;
    if (!parkingId) return NextResponse.json({ error: "No tienes un estacionamiento asignado.", code: "PARKING_UNASSIGNED" }, { status: 409 });
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, parkingId);
    const actor = operationActor(authorization.context);
    const body = await request.json().catch(() => ({}));
    const current = await getPosOperatorShiftState(authorization.db, { operatorId: actor.id, parkingId: parking.id });
    if (current.state !== "PROGRAMMED" || !current.shift || (body.shiftId && body.shiftId !== current.shift.id)) {
      return NextResponse.json({ error: "No existe un turno programado válido para iniciar.", code: "PROGRAMMED_SHIFT_NOT_AVAILABLE" }, { status: 409 });
    }
    const shift = await startPosOperatorShift(authorization.db, { shiftId: current.shift.id, actor });
    return NextResponse.json({ data: { state: "OPEN", shift, parking, actor, serverNow: new Date().toISOString() } });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || rpcFailure(error);
  }
}
