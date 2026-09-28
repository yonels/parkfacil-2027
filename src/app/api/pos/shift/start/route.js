import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { findSelectableShift, POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { ensureOnDemandProgrammedShift, OnDemandShiftError } from "@/lib/pos/onDemandShift";
import { getPosOperatorShiftState, startPosOperatorShift } from "@/lib/posOperatorShiftService";

const errors = {
  SHIFT_NOT_FOUND: ["No se encontró el turno asignado.", 404], SHIFT_FORBIDDEN: ["No tienes autorización para iniciar este turno.", 403],
  SHIFT_NOT_PROGRAMMED: ["El turno ya no está disponible para iniciar.", 409], OPERATOR_SHIFT_CONFLICT: ["Ya existe otro turno abierto para el operador.", 409],
  SHIFT_START_CONFLICT: ["El turno cambió mientras se intentaba iniciar. Actualiza e inténtalo nuevamente.", 409],
  PARKING_NOT_ACTIVE: ["El estacionamiento del turno no está activo.", 409], ON_STREET_ASSIGNMENT_REQUIRED: ["El turno on-street no tiene una asignación operacional válida.", 409],
};
function rpcFailure(error) {
  if (error instanceof OnDemandShiftError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  const message = String(error?.message || "");
  for (const [code, [text, status]] of Object.entries(errors)) if (message.includes(code)) return NextResponse.json({ error: text, code }, { status });
  console.error("[POS_SHIFT_START]", { code: error?.code || "POS_SHIFT_START_FAILED", message: error?.message });
  return NextResponse.json({ error: "No fue posible iniciar el turno.", code: "POS_SHIFT_START_FAILED" }, { status: 500 });
}

// Estados sin turno que el operador puede abrir a pedido: sin turno hoy, o el
// de hoy ya cerrado (nuevo turno). Nunca con uno OPEN/CLOSING o PROGRAMMED.
const ON_DEMAND_STATES = new Set(["UNASSIGNED", "CLOSED"]);

export async function POST(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const resolved = await resolvePosOperationalParking(authorization);
    const actor = posOperationActor(authorization.context);
    const body = await request.json().catch(() => ({}));
    const onDemand = body.onDemand === true;

    // Turno a pedido: crea (o reutiliza) el PROGRAMMED de hoy y lo abre con el
    // mismo RPC que un turno programado.
    const openOnDemand = async (parking) => {
      const shiftId = await ensureOnDemandProgrammedShift(authorization.db, { parking, operatorId: actor.id });
      const shift = await startPosOperatorShift(authorization.db, { shiftId, actor });
      const after = await resolvePosOperationalParking(authorization);
      return NextResponse.json({ data: { state: "OPEN", shift, parking: after.parking || parking, actor, onDemand: true, serverNow: new Date().toISOString() } });
    };

    // Selección explícita (varios estacionamientos): el shiftId enviado solo
    // se acepta si está entre los turnos PROGRAMMED de hoy que el servidor
    // calculó para ESTE operador en estacionamientos autorizados. Un turno a
    // pedido solo en un estacionamiento de la lista autorizada server-side.
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      if (body.shiftId) {
        const selected = findSelectableShift(resolved, body.shiftId);
        if (!selected) {
          return NextResponse.json({ error: "Selecciona un turno programado válido para iniciar.", code: "PARKING_SELECTION_REQUIRED" }, { status: 409 });
        }
        const shift = await startPosOperatorShift(authorization.db, { shiftId: selected.shiftId, actor });
        const selectedParking = await resolvePosOperationalParking(authorization);
        return NextResponse.json({ data: { state: "OPEN", shift, parking: selectedParking.parking, actor, serverNow: new Date().toISOString() } });
      }
      if (onDemand) {
        const wanted = String(body.parkingId || "").trim();
        const target = (resolved.authorizedParkings || []).find((item) => String(item.id) === wanted && item.status === "ACTIVE");
        if (!target) {
          return NextResponse.json({ error: "Selecciona un estacionamiento autorizado para iniciar el turno.", code: "PARKING_SELECTION_REQUIRED" }, { status: 409 });
        }
        return await openOnDemand(target);
      }
      return NextResponse.json({ error: "Selecciona un turno programado válido para iniciar.", code: "PARKING_SELECTION_REQUIRED" }, { status: 409 });
    }

    const parking = resolved.parking;
    if (!parking) return NextResponse.json({ error: "No tienes un estacionamiento asignado.", code: "PARKING_UNASSIGNED" }, { status: 409 });
    const current = await getPosOperatorShiftState(authorization.db, { operatorId: actor.id, parkingId: parking.id });
    if (current.state === "PROGRAMMED" && current.shift && (!body.shiftId || body.shiftId === current.shift.id)) {
      const shift = await startPosOperatorShift(authorization.db, { shiftId: current.shift.id, actor });
      return NextResponse.json({ data: { state: "OPEN", shift, parking, actor, serverNow: new Date().toISOString() } });
    }
    if (onDemand && ON_DEMAND_STATES.has(current.state)) {
      return await openOnDemand(parking);
    }
    return NextResponse.json({ error: "No existe un turno programado válido para iniciar.", code: "PROGRAMMED_SHIFT_NOT_AVAILABLE" }, { status: 409 });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    return denied || rpcFailure(error);
  }
}
