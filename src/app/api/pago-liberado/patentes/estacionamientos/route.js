import { NextResponse } from "next/server";
import { authorizeReleasedPlates, fail, rpcFailure } from "@/lib/releasedPlates/releasedPlateServer";

// Pago liberado gestionado por el cliente (SOL-2026-10-28-003): el
// administrador activa o desactiva el módulo en un estacionamiento de su
// empresa (la RPC verifica que el estacionamiento sea de la empresa del actor).

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const auth = await authorizeReleasedPlates(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const parkingId = String(body.parkingId || "");
  if (!UUID.test(parkingId) || typeof body.enabled !== "boolean") return fail("Indica el estacionamiento y si se activa o desactiva.", 400);
  const parking = await auth.db.from("parkings").select("id").eq("id", parkingId).eq("company_id", auth.actor.companyId).eq("type", "OFF_STREET").maybeSingle();
  if (parking.error) return fail("No fue posible validar el estacionamiento.", 500);
  if (!parking.data) return fail("Estacionamiento no encontrado.", 404);
  const { data, error } = await auth.db.rpc("released_plate_set_parking", { p_actor_id: auth.actor.id, p_parking_id: parkingId, p_enabled: body.enabled });
  if (error) return rpcFailure(error, "No fue posible cambiar la activación.");
  return NextResponse.json({ data: { parkingId: data.parking_id, enabled: data.enabled, updatedAt: data.updated_at } });
}
