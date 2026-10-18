import { NextResponse } from "next/server";
import { authorizationFromDb, authorizationRpcInput, validateAuthorizationInput } from "@/lib/releasedPayment/authorizationCore.mjs";
import { authorizationUnavailable, authorizeReleasedPayment, fail, loadModuleStates, loadTariffs, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Fase C: modificar (nueva versión con antes/después) o revocar una
// autorización. La patente no cambia: otra patente es otra autorización.
// Las estadías abiertas conservan las condiciones congeladas al ingreso.
// Si la modificación mantiene tarifa, cantidad e inicio, se conserva la
// copia comercial acordada aunque la tarifa haya cambiado después.

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth.response;
  const { parkingId, authorizationId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento.", 404);
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return fail("Indica el motivo.", 400, { code: "RELEASED_PAYMENT_REASON_REQUIRED" });

  if (body.action === "REVOKE") {
    const { data, error } = await auth.db.rpc("released_payment_revoke_authorization", {
      p_actor_id: auth.actor.id,
      p_parking_id: parking.id,
      p_authorization_id: authorizationId,
      p_reason: reason.slice(0, 500),
    });
    if (error) return rpcFailure(error, "No fue posible revocar la autorización.");
    return NextResponse.json({ data: authorizationFromDb(data) });
  }

  const current = await auth.db.from("released_payment_authorizations").select("*").eq("id", authorizationId).eq("parking_id", parking.id).maybeSingle();
  if (current.error) return rpcFailure(current.error, "No fue posible cargar la autorización.");
  if (!current.data) return fail("No se encontró la autorización.", 404);
  const state = (await loadModuleStates(auth.db, [parking.id])).get(parking.id);
  const unavailable = authorizationUnavailable(state);
  if (unavailable) return unavailable;
  const tariffs = await loadTariffs(auth.db, parking.id);
  const validation = validateAuthorizationInput(body, { contract: state?.contract || null, tariffs: tariffs.current, current: authorizationFromDb(current.data) });
  if (!validation.ok) return fail("Revisa la autorización.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
  const { data, error } = await auth.db.rpc("released_payment_save_authorization", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_authorization_id: authorizationId,
    p_input: authorizationRpcInput(validation.value, current.data.license_plate),
    p_reason: reason.slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible modificar la autorización.");
  return NextResponse.json({ data: authorizationFromDb(data) });
}
