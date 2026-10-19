import { NextResponse } from "next/server";
import { authorizeOperationRequest, operationActor, operationAuthorizationError } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listParkings } from "@/lib/estacionamientosRepository";
import { canReviewCardPayments, CARD_ATTEMPTS_UNAVAILABLE, getCardPaymentAttemptRow, isCardAttemptsStorageMissing, mapCardPaymentAttempt } from "@/lib/pos/cardPaymentAttempts.mjs";

// Consulta y regularización de intentos de pago con tarjeta (portal Cliente /
// Root). Solo administradores, y solo sobre estacionamientos Off Street de su
// alcance (misma regla que /api/deudas): un intento de otra empresa responde
// 404, sin revelar que existe.
export async function authorizeCardPaymentReview(request) {
  const authorization = await authorizeOperationRequest(request, PERMISSIONS.REPORTS_READ);
  if (authorization.response) return { response: authorization.response };
  if (!canReviewCardPayments(authorization.context.role)) {
    return { response: NextResponse.json({ error: "Solo un administrador puede revisar los pagos con tarjeta.", code: "CARD_PAYMENTS_FORBIDDEN" }, { status: 403 }) };
  }
  const scopedParkings = (await listParkings(authorization.db, authorization.scope)).filter((parking) => parking.type === "OFF_STREET");
  return { authorization, scopedParkings, actor: operationActor(authorization.context) };
}

export async function loadScopedCardPaymentAttempt(db, scopedParkings, attemptId) {
  const row = await getCardPaymentAttemptRow(db, { attemptId });
  if (!row || !scopedParkings.some((parking) => parking.id === row.parking_id)) return null;
  const parking = scopedParkings.find((item) => item.id === row.parking_id);
  return { row, attempt: { ...mapCardPaymentAttempt(row), parkingName: parking?.name || "", parkingCode: parking?.code || "", companyName: parking?.companyName || "" } };
}

export function cardPaymentReviewFailure(request, context, error, fallback) {
  const denied = operationAuthorizationError(request, context, error);
  if (denied) return denied;
  if (isCardAttemptsStorageMissing(error)) {
    return NextResponse.json({ error: "La consulta de pagos con tarjeta todavía no está habilitada en este ambiente.", code: CARD_ATTEMPTS_UNAVAILABLE.code }, { status: 503 });
  }
  console.error("[pagos-tarjeta]", { code: error?.code, message: error?.message });
  return NextResponse.json({ error: fallback }, { status: 503 });
}
