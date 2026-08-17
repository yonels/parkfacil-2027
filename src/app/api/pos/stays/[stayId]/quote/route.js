import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { quoteOpenPosStay } from "@/lib/posStaysService";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const parkingId = authorization.context.role === ROLES.OPERATOR
      ? authorization.assignedParkingIds?.[0] || null
      : authorization.assignedParkingIds?.[0] || null;

    if (!parkingId) {
      return fail("El usuario no tiene un estacionamiento autorizado.", 404);
    }

    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, parkingId);
    const { stayId } = await params;
    const detail = await quoteOpenPosStay(authorization.db, parking.id, stayId, { now: new Date() });

    if (!detail.stay) {
      return fail("No existe una estadía abierta para el vehículo solicitado.", 404);
    }

    return NextResponse.json({
      data: {
        parking: detail.parking || parking,
        serverNow: detail.serverNow,
        stay: detail.stay,
        quote: detail.quote,
        actor: { ...operationActor(authorization.context), parkingId: parking.id },
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible cotizar la estadía.", 503);
  }
}
