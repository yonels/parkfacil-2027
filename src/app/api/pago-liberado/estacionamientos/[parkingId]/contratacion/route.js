import { NextResponse } from "next/server";
import { validateMonthlyFeeInput } from "@/lib/releasedPayment/contractCore.mjs";
import { contractFromDb } from "@/lib/releasedPayment/releasedStayCore.mjs";
import { authorizeReleasedPayment, fail, requireScopedParking, rpcFailure } from "@/lib/releasedPayment/releasedPaymentServer";

// Nueva versión de la contratación (solo Root, SOL-2026-10-05-002): importe
// mensual final en UF + IVA, plazo (12, 24 o 36 meses) e inicio; base,
// descuentos, referencia y propuesta CRM opcionales. Sin cupos (los define el
// cliente). La base calcula el término. Contratar NO activa el módulo.

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authorizeReleasedPayment(request, "root");
  if (auth.response) return auth.response;
  const { parkingId } = await params;
  const parking = await requireScopedParking(auth.db, auth, parkingId);
  if (!parking) return fail("No se encontró el estacionamiento Off Street.", 404);
  const validation = validateMonthlyFeeInput(await request.json().catch(() => ({})));
  if (!validation.ok) return fail("Revisa los datos de la contratación.", 400, { code: "VALIDATION_ERROR", details: validation.errors });
  const { reason, monthlyFeeUf, baseMonthlyFeeUf, discountNotes, termMonths, startsAt, contractReference, crmProposalNumber, notes } = validation.value;
  const input = { monthlyFeeUf, baseMonthlyFeeUf, discountNotes, termMonths, startsAt, contractReference, crmProposalNumber, notes };
  const { data, error } = await auth.db.rpc("released_payment_save_monthly_fee", {
    p_actor_id: auth.actor.id,
    p_parking_id: parking.id,
    p_input: input,
    p_reason: reason,
  });
  if (error) return rpcFailure(error, "No fue posible guardar la contratación.");
  return NextResponse.json({ data: contractFromDb(data) }, { status: 201 });
}
