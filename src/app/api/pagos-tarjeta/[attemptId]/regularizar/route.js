import { NextResponse } from "next/server";
import { canRegularizeCardPayments, cardAttemptErrorResponse, isUuid, mapCardPaymentAttempt, regularizeCardPaymentAttempt, validateRegularizationInput } from "@/lib/pos/cardPaymentAttempts.mjs";
import { authorizeCardPaymentReview, cardPaymentReviewFailure, loadScopedCardPaymentAttempt } from "@/lib/pos/cardPaymentAttemptsRoute";

// Regularización manual de un intento con resultado incierto. Solo un
// administrador (política pendiente de aprobación funcional); el operador
// nunca. Deja actor, fecha, motivo, evidencia y estado anterior. Es una
// declaración manual: NO una verificación contra TUU.
export async function POST(request, { params }) {
  let review;
  try {
    review = await authorizeCardPaymentReview(request);
    if (review.response) return review.response;
    if (!canRegularizeCardPayments(review.authorization.context.role)) {
      return NextResponse.json({ error: "No tienes permiso para regularizar pagos con tarjeta.", code: "CARD_PAYMENTS_FORBIDDEN" }, { status: 403 });
    }
    const { attemptId } = await params;
    const found = isUuid(attemptId) ? await loadScopedCardPaymentAttempt(review.authorization.db, review.scopedParkings, attemptId) : null;
    if (!found) return NextResponse.json({ error: "El intento de pago no existe.", code: "CARD_ATTEMPT_NOT_FOUND" }, { status: 404 });
    const input = validateRegularizationInput(await request.json().catch(() => ({})));
    if (!input.ok) return NextResponse.json({ error: input.error, code: input.code }, { status: 400 });
    let row;
    try {
      row = await regularizeCardPaymentAttempt(review.authorization.db, {
        attemptId: found.row.id, companyId: found.row.company_id, actorId: review.actor.id, actorName: review.actor.name,
        resolution: input.resolution, reference: input.reference, reason: input.reason, evidence: input.evidence,
      });
    } catch (error) {
      const mapped = cardAttemptErrorResponse(error);
      if (mapped) return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status });
      throw error;
    }
    console.info("[pagos-tarjeta:regularizar]", { attemptId: found.row.id, actorId: review.actor.id, resolution: input.resolution, previousStatus: found.row.status, status: row?.status || null });
    return NextResponse.json({ data: mapCardPaymentAttempt(row) });
  } catch (error) {
    return cardPaymentReviewFailure(request, review?.authorization?.context, error, "No fue posible regularizar el intento de pago.");
  }
}
