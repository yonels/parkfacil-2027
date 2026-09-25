import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { getOperatorClosureByShift, getPosOperatorShiftState, loadOperatorShiftPreview } from "@/lib/posOperatorShiftService";

const noStore = { "Cache-Control": "no-store" };
function fail(message, status, code) { return NextResponse.json({ error: message, code }, { status, headers: noStore }); }

export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const resolved = await resolvePosOperationalParking(authorization);
    // Varios estacionamientos autorizados sin un turno que los desambigüe:
    // el operador elige explícitamente cuál turno programado iniciar (ver
    // /api/pos/shift/start). Las opciones se calculan server-side.
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      return NextResponse.json({ data: { state: "PARKING_SELECTION_REQUIRED", shift: null, parking: null, parkingOptions: resolved.options, serverNow: new Date().toISOString() } }, { headers: noStore });
    }
    const parking = resolved.parking;
    if (!parking) return NextResponse.json({ data: { state: "UNASSIGNED", shift: null, parking: null } }, { headers: noStore });
    const actor = posOperationActor(authorization.context);
    const current = await getPosOperatorShiftState(authorization.db, { operatorId: actor.id, parkingId: parking.id });
    let preview = null;
    let closure = null;
    if (current.state === "OPEN") {
      if (current.shift.status === "CLOSING") closure = await getOperatorClosureByShift(authorization.db, current.shift.id);
      else preview = await loadOperatorShiftPreview(authorization.db, current.shift);
    } else if (current.state === "CLOSED") {
      closure = await getOperatorClosureByShift(authorization.db, current.shift.id);
    }
    return NextResponse.json({ data: { ...current, parking, actor, preview, closure, closed: Boolean(closure), serverNow: new Date().toISOString() } }, { headers: noStore });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    console.error("[POS_SHIFT_GET]", { code: error?.code || "POS_SHIFT_READ_FAILED", message: error?.message });
    return fail("No fue posible consultar el turno del operador.", 500, "POS_SHIFT_READ_FAILED");
  }
}
