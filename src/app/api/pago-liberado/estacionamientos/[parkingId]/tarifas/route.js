import { NextResponse } from "next/server";
import { tariffFromDb, TARIFF_UNITS, validateTariffInput } from "@/lib/releasedPayment/tariffCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Tarifas que el estacionamiento cobra a sus beneficiarios (SOL-2026-10-05-001).
// Las define el administrador de la empresa (Root supervisa). Son
// independientes del importe mensual que ParkFacil cobra por el módulo.
// - POST: nueva versión de la tarifa de una unidad (hora, día, mes o año).
// - PATCH { action: "RETIRE" }: retira la tarifa vigente de una unidad.
// Ninguna de las dos altera autorizaciones ya acordadas (guardan su copia).

export const dynamic = "force-dynamic";

async function scoped(request, params) {
  const auth = await authorizeReleasedPayment(request, "admin");
  if (auth.response) return { response: auth.response };
  const { parkingId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return { response: fail("No se encontró el estacionamiento.", 404) };
  return { auth, parking };
}

export async function POST(request, { params }) {
  const { response, auth, parking } = await scoped(request, params);
  if (response) return response;
  const validation = validateTariffInput(await request.json().catch(() => ({})));
  if (!validation.ok) return fail("Revisa la tarifa.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
  const { reason, ...input } = validation.value;
  const { data, error } = await auth.db.rpc("released_payment_save_tariff", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_input: input,
    p_reason: reason,
  });
  if (error) return rpcFailure(error, "No fue posible guardar la tarifa.");
  return NextResponse.json({ data: tariffFromDb(data) }, { status: 201 });
}

export async function PATCH(request, { params }) {
  const { response, auth, parking } = await scoped(request, params);
  if (response) return response;
  const body = await request.json().catch(() => ({}));
  if (body.action !== "RETIRE") return fail("Acción no válida.", 400);
  const billingUnit = String(body.billingUnit || "").toUpperCase();
  if (!TARIFF_UNITS[billingUnit]) return fail("Selecciona la unidad de la tarifa.", 400);
  const reason = String(body.reason || "").trim();
  if (reason.length < 3) return fail("Indica el motivo.", 400, { code: "RELEASED_PAYMENT_REASON_REQUIRED" });
  const { data, error } = await auth.db.rpc("released_payment_retire_tariff", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_billing_unit: billingUnit,
    p_reason: reason.slice(0, 500),
  });
  if (error) return rpcFailure(error, "No fue posible retirar la tarifa.");
  return NextResponse.json({ data: tariffFromDb(data) });
}
