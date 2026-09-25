import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, posParkingSelectionRequiredResponse, requireOperationalParking, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { quoteOpenPosStay } from "@/lib/posStaysService";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function GET(request, { params }) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const resolved = await resolvePosOperationalParking(authorization);
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      return NextResponse.json(posParkingSelectionRequiredResponse(), { status: 409 });
    }
    if (!resolved.parkingId) {
      return fail("El usuario no tiene un estacionamiento autorizado.", 404);
    }
    // Defensa adicional antes de exponer datos de una estadía: el
    // estacionamiento resuelto se revalida contra el scope de la sesión.
    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, resolved.parkingId);

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
        actor: { ...posOperationActor(authorization.context), parkingId: parking.id },
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible cotizar la estadía.", 503);
  }
}
