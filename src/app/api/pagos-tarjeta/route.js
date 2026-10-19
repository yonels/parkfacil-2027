import { NextResponse } from "next/server";
import { CARD_ATTEMPT_STATUS, listCardPaymentAttemptRows, mapCardPaymentAttempt, UNRESOLVED_CARD_ATTEMPT_STATUSES } from "@/lib/pos/cardPaymentAttempts.mjs";
import { authorizeCardPaymentReview, cardPaymentReviewFailure } from "@/lib/pos/cardPaymentAttemptsRoute";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Intentos de pago con tarjeta del POS (pendientes, inciertos y resueltos),
// con aislamiento por empresa/estacionamiento. `status=UNRESOLVED` devuelve
// los que requieren atención.
export async function GET(request) {
  let review;
  try {
    review = await authorizeCardPaymentReview(request);
    if (review.response) return review.response;
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "UNRESOLVED";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (status !== "ALL" && status !== "UNRESOLVED" && !Object.values(CARD_ATTEMPT_STATUS).includes(status)) {
      return NextResponse.json({ error: "Estado no válido.", code: "INVALID_FILTERS" }, { status: 400 });
    }
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
      return NextResponse.json({ error: "Fecha no válida.", code: "INVALID_FILTERS" }, { status: 400 });
    }
    const parkingIds = review.scopedParkings.map((parking) => parking.id);
    const parkingId = url.searchParams.get("parkingId");
    if (parkingId && !parkingIds.includes(parkingId)) {
      return NextResponse.json({ error: "Estacionamiento fuera de tu alcance.", code: "PARKING_FORBIDDEN" }, { status: 403 });
    }
    const statuses = status === "ALL" ? null : status === "UNRESOLVED" ? UNRESOLVED_CARD_ATTEMPT_STATUSES : [status];
    const rows = await listCardPaymentAttemptRows(review.authorization.db, { parkingIds, statuses, from, to, plate: url.searchParams.get("plate"), parkingId });
    const byId = new Map(review.scopedParkings.map((parking) => [parking.id, parking]));
    return NextResponse.json({
      data: rows.map((row) => ({ ...mapCardPaymentAttempt(row), parkingName: byId.get(row.parking_id)?.name || "", parkingCode: byId.get(row.parking_id)?.code || "", companyName: byId.get(row.parking_id)?.companyName || "" })),
      parkings: review.scopedParkings.map((parking) => ({ id: parking.id, name: parking.name, code: parking.code })),
    });
  } catch (error) {
    return cardPaymentReviewFailure(request, review?.authorization?.context, error, "No fue posible cargar los pagos con tarjeta.");
  }
}
