import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { closePosOperatorShift, getPosOperatorShiftState, loadOperatorShiftPreview } from "@/lib/posOperatorShiftService";
import { validatePosClosureInput } from "@/lib/posOperatorShiftCore.mjs";

const knownErrors = {
  SHIFT_NOT_FOUND: ["No se encontró el turno a cerrar.", 404], SHIFT_NOT_CLOSABLE: ["El turno ya no está abierto.", 409],
  SHIFT_ALREADY_CLOSED: ["El turno ya fue cerrado.", 409], SHIFT_FORBIDDEN: ["No tienes autorización para cerrar este turno.", 403],
  SHIFT_PAYMENT_TRACE_MISMATCH: ["Se detectó una inconsistencia en la trazabilidad de pagos del turno.", 409],
  DIFFERENCE_OBSERVATION_REQUIRED: ["Debes indicar una observación cuando el efectivo declarado no coincide.", 400],
  INVALID_DECLARED_CASH: ["Ingresa un monto válido de efectivo declarado.", 400],
};
function failure(error) {
  const message = String(error?.message || "");
  for (const [code, [text, status]] of Object.entries(knownErrors)) if (message.includes(code)) return NextResponse.json({ error: text, code }, { status });
  console.error("[POS_SHIFT_CLOSE]", { code: error?.code || "POS_SHIFT_CLOSE_FAILED", message: error?.message });
  return NextResponse.json({ error: "No fue posible cerrar el turno.", code: "POS_SHIFT_CLOSE_FAILED" }, { status: 500 });
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
    const current = await getPosOperatorShiftState(authorization.db, { operatorId: actor.id, parkingId: parking.id });
    if (current.state !== "OPEN" || current.shift.status !== "OPEN") return NextResponse.json({ error: "No existe un turno abierto para cerrar.", code: "OPEN_SHIFT_NOT_AVAILABLE" }, { status: 409 });
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== true) return NextResponse.json({ error: "Debes confirmar el cierre.", code: "CLOSURE_CONFIRMATION_REQUIRED" }, { status: 400 });
    const preview = await loadOperatorShiftPreview(authorization.db, current.shift);
    const validated = validatePosClosureInput(body, preview.cashAmount);
    if (!validated.ok) {
      const [error, status] = knownErrors[validated.code];
      return NextResponse.json({ error, code: validated.code }, { status });
    }
    const closure = await closePosOperatorShift(authorization.db, { shiftId: current.shift.id, actor, notes: body.notes, declaredCashAmount: validated.declaredCashAmount, differenceObservation: validated.differenceObservation });
    return NextResponse.json({ data: { closure, parking, actor } });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || failure(error);
  }
}
