import { NextResponse } from "next/server";
import { regularizationFromDb, validateRegularizationInput } from "@/lib/releasedPayment/regularizationCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Etapa 3 (paso 3.2): regularización de una estadía liberada por el
// administrador del estacionamiento, sin tocar dinero, con motivo y
// auditoría (cerrar una abierta o anular el beneficio). Root solo supervisa.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth.response;
  const { parkingId, stayId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento.", 404);
  const stay = await auth.db.from("parking_stays").select("id,status,entry_at,released_payment_authorization_id").eq("id", stayId).eq("parking_id", parking.id).maybeSingle();
  if (stay.error) return rpcFailure(stay.error, "No fue posible cargar la estadía.");
  if (!stay.data) return fail("No se encontró la estadía.", 404);
  const body = await request.json().catch(() => ({}));
  const checked = validateRegularizationInput(body, { stay: stay.data });
  if (checked.errors) return fail("Revisa los datos de la regularización.", 400, { details: checked.errors });
  const { data, error } = await auth.db.rpc("released_payment_regularize_stay", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_stay_id: stayId,
    p_action: checked.value.action,
    p_exit_at: checked.value.exitAt,
    p_reason: checked.value.reason,
  });
  if (error) return rpcFailure(error, "No fue posible regularizar la estadía.");
  return NextResponse.json({ data: regularizationFromDb(data) }, { status: 201 });
}
