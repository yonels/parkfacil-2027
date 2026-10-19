import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posParkingSelectionRequiredResponse, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { ACTIVE_CARD_ATTEMPT_STATUSES, cardAttemptBlocksStay, isCardAttemptsStorageMissing, listCardPaymentAttemptRows, mapCardPaymentAttemptForPos } from "@/lib/pos/cardPaymentAttempts.mjs";

const noStore = { "Cache-Control": "no-store" };

// POS — intentos de pago con tarjeta SIN CERRAR del estacionamiento del turno
// (reserva central, SOL-2026-10-11-001). Permite que cualquier equipo consulte
// el estado de un pago iniciado en otro equipo. Es solo consulta: nunca abre
// TUU ni relanza un cobro.
export async function GET(request) {
  let authorization;
  try {
    authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
    if (authorization.response) return authorization.response;
    const resolved = await resolvePosOperationalParking(authorization);
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      return NextResponse.json(posParkingSelectionRequiredResponse(), { status: 409, headers: noStore });
    }
    if (!resolved.parking) return NextResponse.json({ data: { available: false, attempts: [] } }, { headers: noStore });
    let rows;
    try {
      rows = await listCardPaymentAttemptRows(authorization.db, { parkingIds: [resolved.parking.id], statuses: ACTIVE_CARD_ATTEMPT_STATUSES, limit: 100 });
    } catch (error) {
      // Migración no aplicada: el pago con tarjeta no está habilitado.
      if (isCardAttemptsStorageMissing(error)) return NextResponse.json({ data: { available: false, attempts: [] } }, { headers: noStore });
      throw error;
    }
    const now = new Date();
    const attempts = rows.map(mapCardPaymentAttemptForPos).filter((attempt) => cardAttemptBlocksStay(attempt, now));
    return NextResponse.json({ data: { available: true, attempts, serverNow: now.toISOString() } }, { headers: noStore });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    console.error("[pos:card-payments:GET]", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "No fue posible consultar los pagos con tarjeta." }, { status: 503, headers: noStore });
  }
}
