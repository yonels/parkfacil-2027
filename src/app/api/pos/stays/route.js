import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, posParkingSelectionRequiredResponse, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { listOpenPosStays } from "@/lib/posStaysService";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const resolved = await resolvePosOperationalParking(authorization);
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      return NextResponse.json(posParkingSelectionRequiredResponse(), { status: 409 });
    }
    const parking = resolved.parking;
    if (!parking) {
      return fail("El usuario no tiene un estacionamiento autorizado.", 404);
    }

    const summary = await listOpenPosStays(authorization.db, parking.id, { now: new Date() });

    return NextResponse.json({
      data: {
        parking: summary.parking || parking,
        serverNow: summary.serverNow,
        stays: summary.stays,
        actor: { ...posOperationActor(authorization.context), parkingId: parking.id },
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible cargar los vehículos estacionados.", 503);
  }
}
