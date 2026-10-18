import { NextResponse } from "next/server";
import { moduleFromDb } from "@/lib/releasedPayment/releasedStayCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Cupos simultáneos destinados a Pago liberado (SOL-2026-10-05-002). Los
// define el administrador de la empresa en estacionamientos con el módulo
// activo; Root supervisa. La RPC usa el mismo bloqueo que el ingreso con
// beneficio y no permite bajar de la ocupación liberada vigente.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth.response;
  const { parkingId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento.", 404);
  const body = await request.json().catch(() => ({}));
  const spots = Number(body.operationalSpots);
  if (!Number.isInteger(spots) || spots < 0 || spots > 1000) return fail("Los cupos deben ser un entero entre 0 y 1000.", 400, { code: "VALIDATION_ERROR" });
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return fail("Indica el motivo del cambio.", 400, { code: "RELEASED_PAYMENT_REASON_REQUIRED" });
  const { data, error } = await auth.db.rpc("released_payment_set_operational_spots", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_spots: spots,
    p_reason: reason.slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible guardar los cupos.");
  return NextResponse.json({ data: moduleFromDb(data) });
}
