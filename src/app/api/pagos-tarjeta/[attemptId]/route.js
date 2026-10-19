import { NextResponse } from "next/server";
import { canRegularizeCardPayments, isUuid } from "@/lib/pos/cardPaymentAttempts.mjs";
import { authorizeCardPaymentReview, cardPaymentReviewFailure, loadScopedCardPaymentAttempt } from "@/lib/pos/cardPaymentAttemptsRoute";

// Detalle de un intento de pago con tarjeta (clic en la lista).
export async function GET(request, { params }) {
  let review;
  try {
    review = await authorizeCardPaymentReview(request);
    if (review.response) return review.response;
    const { attemptId } = await params;
    const found = isUuid(attemptId) ? await loadScopedCardPaymentAttempt(review.authorization.db, review.scopedParkings, attemptId) : null;
    if (!found) return NextResponse.json({ error: "El intento de pago no existe.", code: "CARD_ATTEMPT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ data: { ...found.attempt, canRegularize: canRegularizeCardPayments(review.authorization.context.role) } });
  } catch (error) {
    return cardPaymentReviewFailure(request, review?.authorization?.context, error, "No fue posible cargar el intento de pago.");
  }
}
