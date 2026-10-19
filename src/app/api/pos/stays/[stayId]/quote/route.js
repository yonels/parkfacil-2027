import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, posParkingSelectionRequiredResponse, requireOperationalParking, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { quoteOpenPosStay } from "@/lib/posStaysService";
import { loadReleasedStaySnapshot } from "@/lib/parkingStayQuoteService";
import { COUPONS_DISABLED_ERROR, couponsEnabled } from "@/lib/cupones/couponsAvailability.mjs";
import { couponsActiveForParking } from "@/lib/cupones/couponModuleServer";
import { COUPON_MODULE_INACTIVE_ERROR } from "@/lib/cupones/couponModuleCore.mjs";
import { couponTokenForRequest } from "@/lib/cupones/couponInput.mjs";
import { findActiveCardPaymentAttemptRow, isCardAttemptsStorageMissing, mapCardPaymentAttemptForPos } from "@/lib/pos/cardPaymentAttempts.mjs";

function fail(message, status = 400, details) {
  return NextResponse.json({ error: message, details }, { status });
}

// Cupón (SOL-2026-10-19-002): POST con { couponToken } recalcula el cobro con el
// cupón (QR "PFC-COUPON:<token>" o código de 4 caracteres; "PF-XXXXXXXX" anterior). El cálculo firmado
// resultante lleva el cupón y se canjea al pagar (efectivo o tarjeta).
const COUPON_ERRORS = Object.freeze({
  COUPON_NOT_FOUND: "El cupón no existe.",
  COUPON_ALREADY_USED: "El cupón ya fue utilizado.",
  COUPON_WRONG_COMPANY: "El cupón no corresponde a este estacionamiento.",
  COUPON_NOT_YET_VALID: "El cupón todavía no está vigente.",
  COUPON_EXPIRED: "El cupón está vencido.",
});

export async function GET(request, context) {
  return quoteStay(request, context, null);
}

export async function POST(request, context) {
  if (!couponsEnabled()) return NextResponse.json({ error: COUPONS_DISABLED_ERROR.error, code: COUPONS_DISABLED_ERROR.code }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const couponToken = couponTokenForRequest(body?.couponToken);
  if (!couponToken) return NextResponse.json({ error: "El código del cupón no es válido.", code: "COUPON_NOT_FOUND" }, { status: 400 });
  return quoteStay(request, context, couponToken);
}

async function quoteStay(request, { params }, couponToken) {
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
    const parking = await requireOperationalParking(authorization.db, authorization.context, resolved.parkingScope || authorization.scope, resolved.parkingId);

    const { stayId } = await params;
    // Módulo Cupones activo de la empresa del estacionamiento (etapa C).
    if (couponToken && !(await couponsActiveForParking(authorization.db, parking.id))) {
      return NextResponse.json({ error: COUPON_MODULE_INACTIVE_ERROR.error, code: COUPON_MODULE_INACTIVE_ERROR.code }, { status: 403 });
    }
    if (couponToken && await loadReleasedStaySnapshot(authorization.db, stayId)) {
      return NextResponse.json({ error: "Los cupones no aplican a patentes liberadas.", code: "RELEASED_PAYMENT_NO_COUPON" }, { status: 409 });
    }
    let detail;
    try {
      detail = await quoteOpenPosStay(authorization.db, parking.id, stayId, { now: new Date(), ...(couponToken ? { couponToken } : {}) });
    } catch (quoteError) {
      const couponMessage = COUPON_ERRORS[quoteError?.message];
      if (couponMessage) return NextResponse.json({ error: couponMessage, code: quoteError.message }, { status: 409 });
      throw quoteError;
    }

    if (!detail.stay) {
      return fail("No existe una estadía abierta para el vehículo solicitado.", 404);
    }

    // Reserva central: intento de pago con tarjeta activo de este ticket (de
    // cualquier equipo). Con uno activo el POS no ofrece medios de pago.
    let cardPaymentAttempt = null;
    try {
      cardPaymentAttempt = mapCardPaymentAttemptForPos(await findActiveCardPaymentAttemptRow(authorization.db, { stayId: detail.stay.id }));
    } catch (attemptError) {
      if (!isCardAttemptsStorageMissing(attemptError)) throw attemptError;
    }

    return NextResponse.json({
      data: {
        parking: detail.parking || parking,
        serverNow: detail.serverNow,
        stay: detail.stay,
        quote: detail.quote,
        cardPaymentAttempt,
        cardTypeCaptureAvailable: detail.cardTypeCaptureAvailable === true,
        actor: { ...posOperationActor(authorization.context), parkingId: parking.id },
      },
    });
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return denied;
    return fail("No fue posible calcular el cobro del vehículo.", 503);
  }
}
