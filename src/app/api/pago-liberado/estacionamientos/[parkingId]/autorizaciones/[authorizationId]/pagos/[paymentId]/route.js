import { NextResponse } from "next/server";
import { paymentFromDb } from "@/lib/releasedPayment/paymentCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Anular un pago registrado por error (solo el administrador, con motivo).
// El pago no se borra: queda anulado en el historial y la autorización vuelve
// a "Pago pendiente".

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth.response;
  const { parkingId, authorizationId, paymentId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento.", 404);
  const body = await request.json().catch(() => ({}));
  if (body.action !== "VOID") return fail("Acción no válida.", 400);
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return fail("Indica el motivo de la anulación.", 400, { code: "RELEASED_PAYMENT_REASON_REQUIRED" });
  const payment = await auth.db.from("released_payment_beneficiary_payments").select("id").eq("id", paymentId).eq("authorization_id", authorizationId).eq("parking_id", parking.id).maybeSingle();
  if (payment.error) return rpcFailure(payment.error, "No fue posible cargar el pago.");
  if (!payment.data) return fail("No se encontró el pago.", 404);
  const { data, error } = await auth.db.rpc("released_payment_void_beneficiary_payment", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_payment_id: paymentId,
    p_reason: reason.slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible anular el pago.");
  return NextResponse.json({ data: paymentFromDb(data) });
}
