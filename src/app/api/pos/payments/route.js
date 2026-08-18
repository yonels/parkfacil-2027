import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError, requireOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listDailyPosPayments } from "@/lib/posStaysService";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Pagos del día para el parking asignado al operador autenticado. La misma
// autorización operacional que protege /api/pos/stays (empresa + parking
// asignado) acota esta consulta; ver listDailyPosPayments en
// @/lib/posStaysService para el filtrado por día operacional y el cálculo
// de totales (fuente de verdad: backend/base de datos, no el frontend).
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;

    const parkingId = authorization.assignedParkingIds?.[0] || null;
    if (!parkingId) {
      return fail("El usuario no tiene un estacionamiento autorizado.", 404);
    }

    const parking = await requireOperationalParking(authorization.db, authorization.context, authorization.scope, parkingId);
    const summary = await listDailyPosPayments(authorization.db, parking.id, { now: new Date() });

    return NextResponse.json({
      data: {
        parking: summary.parking || parking,
        serverNow: summary.serverNow,
        payments: summary.payments,
        totals: summary.totals,
        actor: { ...operationActor(authorization.context), parkingId: parking.id },
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible cargar los pagos del día.", 503);
  }
}
