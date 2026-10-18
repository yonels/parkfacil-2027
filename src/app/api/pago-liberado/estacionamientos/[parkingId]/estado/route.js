import { NextResponse } from "next/server";
import { moduleFromDb } from "@/lib/releasedPayment/releasedStayCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Fase B: activar / desactivar el módulo por estacionamiento (solo Root,
// con motivo). Desactivar bloquea nuevos ingresos con beneficio y nuevas
// autorizaciones; conserva datos e historial. Reactivar exige contratación
// vigente (la RPC lo verifica) y los cupos se revisan en cada ingreso.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "root");
  if (auth.response) return auth.response;
  const { parkingId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento Off Street.", 404);
  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") return fail("Indica si el módulo se activa o se desactiva.", 400);
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return fail("Indica el motivo del cambio.", 400, { code: "RELEASED_PAYMENT_REASON_REQUIRED" });
  const { data, error } = await auth.db.rpc("released_payment_set_module_state", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_enabled: body.enabled,
    p_reason: reason.slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible cambiar el estado del módulo.");
  return NextResponse.json({ data: moduleFromDb(data) });
}
