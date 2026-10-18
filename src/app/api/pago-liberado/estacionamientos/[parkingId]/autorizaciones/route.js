import { NextResponse } from "next/server";
import { authorizationFromDb, authorizationRpcInput, validateAuthorizationInput, validatePlates } from "@/lib/releasedPayment/authorizationCore.mjs";
import { authorizationUnavailable, authorizeReleasedPayment, fail, loadModuleStates, loadTariffs, requireScopedParking, rpcErrorCode, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Fase C: crear autorizaciones (administrador del estacionamiento). Una
// patente o varias (carga masiva): cada patente crea SU autorización
// individual con la misma configuración; nunca un grupo ni un paquete.
// Cada una guarda la tarifa acordada, la cantidad, el total y la vigencia
// (inicio + cantidad de la unidad), calculados y copiados por la RPC.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return auth.response;
  const { parkingId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento.", 404);
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || "").trim();
  const state = (await loadModuleStates(auth.db, [parking.id])).get(parking.id);
  if (!state?.contract) return fail("El estacionamiento no tiene contratación de Pago liberado.", 409, { code: "RELEASED_PAYMENT_CONTRACT_REQUIRED" });
  const unavailable = authorizationUnavailable(state);
  if (unavailable) return unavailable;

  const plates = validatePlates(body);
  const tariffs = await loadTariffs(auth.db, parking.id);
  const validation = validateAuthorizationInput(body, { contract: state.contract, tariffs: tariffs.current });
  const errors = [...plates.errors, ...(validation.ok ? [] : validation.errors)];
  if (reason.length < 3) errors.push("Indica el motivo.");
  if (errors.length) return fail("Revisa la autorización.", 400, { code: "VALIDATION_ERROR", details: errors });

  const created = [];
  const rejected = [];
  for (const plate of plates.plates) {
    const { data, error } = await auth.db.rpc("released_payment_save_authorization", {
      p_actor_id: auth.actor.id,
      p_parking_id: parking.id,
      p_authorization_id: null,
      p_input: authorizationRpcInput(validation.value, plate),
      p_reason: reason.slice(0, 500),
    });
    if (error) {
      // Errores del módulo (desactivado, vencido, sin permiso) aplican a
      // todas: se corta y se informa una sola vez.
      if (!created.length && rpcErrorCode(error) !== null) return rpcFailure(error, "No fue posible crear la autorización.");
      rejected.push({ plate, error: rpcErrorCode(error) || "FAILED" });
      continue;
    }
    created.push(authorizationFromDb(data));
  }
  return NextResponse.json({ data: { created, rejected } }, { status: created.length ? 201 : 409 });
}
