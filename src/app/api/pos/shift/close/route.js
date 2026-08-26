import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { PosShiftClosureError, validateClosureInput } from "@/lib/pos/posShiftCore.mjs";
import { closePosOperatorShift, getPosOperatorShiftState, loadOperatorShiftPreview } from "@/lib/posOperatorShiftService";

function fail(message, status = 400, details, code) {
  return NextResponse.json({ error: message, details, code }, { status });
}

const RPC_ERROR_RESPONSES = {
  SHIFT_NOT_FOUND: ["No se encontró el turno a cerrar.", 404],
  PARKING_NOT_FOUND: ["El estacionamiento del turno no existe o no está activo.", 404],
  SHIFT_NOT_CLOSABLE: ["El turno ya no está abierto.", 409],
  SHIFT_ALREADY_CLOSED: ["Este turno ya fue cerrado. No es posible cerrarlo nuevamente.", 409],
  SHIFT_FORBIDDEN: ["No tienes autorización para cerrar este turno.", 403],
  DIFFERENCE_OBSERVATION_REQUIRED: ["Debes indicar una observación porque el efectivo declarado no coincide con el del sistema.", 400],
  INVALID_DECLARED_CASH: ["Ingresa el efectivo declarado como un monto válido.", 400],
};

function failureFromRpcError(error) {
  const message = String(error?.message || "");
  for (const [code, [text, status]] of Object.entries(RPC_ERROR_RESPONSES)) {
    if (message.includes(code)) return fail(text, status, null, code);
  }
  return fail("No fue posible cerrar el turno.", 500, null, "POS_SHIFT_CLOSE_FAILED");
}

// Confirma el cierre de caja (regla 9): recalcula todo server-side dentro
// de la transacción close_pos_shift — este endpoint NUNCA es la fuente de
// verdad de los montos, solo valida entrada y traduce errores. Rechaza
// doble cierre y turno ajeno (CASOS D y E) porque el propio RPC los
// verifica bajo bloqueo de fila.
export async function POST(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const parkingId = authorization.assignedParkingIds?.[0] || null;
    if (!parkingId) {
      return fail("El usuario no tiene un estacionamiento autorizado.", 404);
    }

    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, parkingId);
    const actor = operationActor(authorization.context);

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== true) {
      return fail("Debes confirmar el cierre de caja.", 400, null, "CLOSURE_CONFIRMATION_REQUIRED");
    }

    const current = await getPosOperatorShiftState(authorization.db, { operatorId: actor.id, parkingId: parking.id, now: new Date() });
    const shift = current.state === "OPEN" ? current.shift : null;
    if (!shift || shift.status !== "OPEN") {
      return fail("Este turno ya fue cerrado. No es posible cerrarlo nuevamente.", 409, null, "SHIFT_ALREADY_CLOSED");
    }

    // Validación previa amigable (mensajes en español, sin round-trip a la
    // base de datos); el RPC vuelve a exigir lo mismo como última garantía.
    const preview = await loadOperatorShiftPreview(authorization.db, shift);
    let sanitized;
    try {
      sanitized = validateClosureInput(
        { declaredCashAmount: body?.declaredCashAmount, differenceObservation: body?.differenceObservation },
        preview.cashAmount
      );
    } catch (error) {
      if (error instanceof PosShiftClosureError) return fail(error.message, error.status, null, error.code);
      throw error;
    }

    const closure = await closePosOperatorShift(authorization.db, {
      shiftId: shift.id,
      actor,
      notes: body?.notes,
      declaredCashAmount: sanitized.declaredCashAmount,
      differenceObservation: sanitized.differenceObservation,
    });

    return NextResponse.json({ data: { closure, parking, actor } });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return failureFromRpcError(error);
  }
}
