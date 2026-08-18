import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getOperatorClosureByShift, getPosOperatorShiftState, loadOperatorShiftPreview } from "@/lib/posOperatorShiftService";

const noStore = { "Cache-Control": "no-store" };
function fail(message, status, code) { return NextResponse.json({ error: message, code }, { status, headers: noStore }); }

export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const parkingId = authorization.assignedParkingIds?.[0] || null;
    if (!parkingId) return NextResponse.json({ data: { state: "UNASSIGNED", shift: null, parking: null } }, { headers: noStore });
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, parkingId);
    const actor = operationActor(authorization.context);
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
