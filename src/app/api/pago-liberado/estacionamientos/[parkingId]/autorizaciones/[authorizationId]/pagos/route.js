import { NextResponse } from "next/server";
import { authorizationFromDb } from "@/lib/releasedPayment/authorizationCore.mjs";
import { paymentFromDb, validatePaymentInput } from "@/lib/releasedPayment/paymentCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Registrar el pago RECIBIDO de un beneficiario (SOL-2026-10-16-003). Solo el
// administrador de la empresa; sin cobro en línea y sin pagos parciales: el
// monto es el total acordado de la autorización (la RPC lo vuelve a exigir).

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth.response;
  const { parkingId, authorizationId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento.", 404);
  const current = await auth.db.from("released_payment_authorizations").select("*").eq("id", authorizationId).eq("parking_id", parking.id).maybeSingle();
  if (current.error) return rpcFailure(current.error, "No fue posible cargar la autorización.");
  if (!current.data) return fail("No se encontró la autorización.", 404);
  const validation = validatePaymentInput(await request.json().catch(() => ({})), { authorization: authorizationFromDb(current.data) });
  if (!validation.ok) return fail("Revisa el pago.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
  const { data, error } = await auth.db.rpc("released_payment_register_beneficiary_payment", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_authorization_id: authorizationId,
    p_input: validation.value,
  });
  if (error) return rpcFailure(error, "No fue posible registrar el pago.");
  return NextResponse.json({ data: paymentFromDb(data) }, { status: 201 });
}
