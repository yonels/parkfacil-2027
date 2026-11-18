import { NextResponse } from "next/server";
import { regularizationFromDb, validateRegularizationInput } from "@/lib/releasedPayment/regularizationCore.mjs";
import { rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";
import { authorizeReleasedPlates, fail } from "@/lib/releasedPlates/releasedPlateServer";

// Pago liberado gestionado por el cliente — regularización de una estadía
// liberada (SOL-2026-11-04-001, decisión D2: «Sí, las mismas dos»). Solo el
// administrador de la empresa; sin movimiento de dinero, con motivo y
// auditoría. La RPC released_plate_regularize_stay vuelve a validar todo.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  const { stayId } = await params;
  const stay = await auth.db.from("parking_stays").select("id,parking_id,status,entry_at,released_plate_authorization_id,parking:parkings(company_id)").eq("id", stayId).maybeSingle();
  if (stay.error) return rpcFailure(stay.error, "No fue posible cargar la estadía.");
  // Una estadía de otra empresa responde igual que una inexistente.
  if (!stay.data || stay.data.parking?.company_id !== auth.actor.companyId) return fail("No se encontró la estadía.", 404);
  const body = await request.json().catch(() => ({}));
  const checked = validateRegularizationInput(body, { stay: stay.data });
  if (checked.errors) return fail("Revisa los datos de la regularización.", 400, { details: checked.errors });
  const { data, error } = await auth.db.rpc("released_plate_regularize_stay", {
    p_actor_id: auth.actor.id,
    p_parking_id: stay.data.parking_id,
    p_stay_id: stayId,
    p_action: checked.value.action,
    p_exit_at: checked.value.exitAt,
    p_reason: checked.value.reason,
  });
  if (error) return rpcFailure(error, "No fue posible regularizar la estadía.");
  return NextResponse.json({ data: regularizationFromDb(data) }, { status: 201 });
}
