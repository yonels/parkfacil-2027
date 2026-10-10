import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { getOperatorClosureByShift, getPosOperatorShiftState, loadOperatorShiftPreview, mapOperatorShift } from "@/lib/posOperatorShiftService";

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
      // onDemandParkings: estacionamientos Off Street autorizados donde el
      // operador puede abrir un turno a pedido (sin turno programado).
      const onDemandParkings = (resolved.authorizedParkings || [])
        .filter((item) => item.status === "ACTIVE" && item.type === "OFF_STREET")
        .map((item) => ({ parkingId: item.id, parkingName: item.name, parkingCode: item.code }));
      // Selector Off Street: offStreetParkings es el pulldown (todos los Off
      // Street activos de la empresa). lastClosure conserva la consulta y
      // reimpresión del último cierre de hoy, que ya no fija el estacionamiento.
      const offStreetParkings = resolved.offStreetOptions || [];
      let lastClosure = null;
      if (offStreetParkings.length && resolved.lastClosedShift) {
        const closedRow = await authorization.db.from("operator_shifts").select("*")
          .eq("id", resolved.lastClosedShift.id).eq("operator_id", authorization.context.userId).eq("status", "CLOSED").maybeSingle();
        if (closedRow.error) throw closedRow.error;
        const closedParking = closedRow.data ? (resolved.knownParkings || []).find((item) => item.id === closedRow.data.parking_id) || null : null;
        const closure = closedParking ? await getOperatorClosureByShift(authorization.db, closedRow.data.id) : null;
        if (closure) lastClosure = { shift: mapOperatorShift(closedRow.data), closure, parking: closedParking };
      }
      return NextResponse.json({ data: { state: "PARKING_SELECTION_REQUIRED", shift: null, parking: null, parkingOptions: resolved.options, onDemandParkings, offStreetParkings, lastClosure, serverNow: new Date().toISOString() } }, { headers: noStore });
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
