import { releasedStayCoverage } from "./releasedPayment/releasedStayCore.mjs";

export class StayAccreditationError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "StayAccreditationError";
    this.code = code;
    this.status = status;
  }
}

function fail(code, message, status) {
  throw new StayAccreditationError(code, message, status);
}

export async function accreditAuthorizedWebpayStay(db, input) {
  const rpc = await db.rpc("accredit_webpay_parking_stay", {
    p_stay_id: input.stayId,
    p_quote_id: input.quoteId,
    p_buy_order: input.buyOrder,
    p_amount: input.amount,
  });

  if (rpc.error) {
    const code = [
      "STAY_NOT_FOUND",
      "QUOTE_NOT_FOUND",
      "STALE_QUOTE",
      "PAYMENT_CONFLICT",
      "AMOUNT_MISMATCH",
      "INVALID_STATE",
    ].find((candidate) => String(rpc.error.message || "").includes(candidate));

    if (code) {
      const status = ["STAY_NOT_FOUND", "QUOTE_NOT_FOUND"].includes(code) ? 404 : 409;
      fail(code, "No fue posible acreditar la estadía.", status);
    }
    throw rpc.error;
  }

  if (!rpc.data?.success || !["PAID", "ALREADY_PAID"].includes(rpc.data?.result)) {
    fail("AMBIGUOUS_RESULT", "La acreditación no entregó una confirmación inequívoca.", 503);
  }

  if (rpc.data.result === "PAID") await recordReleasedSeconds(db, input.stayId);
  return rpc.data;
}

// Pago liberado: una estadía liberada pagada en línea (excedente) guarda el
// tiempo cubierto y cobrado, igual que al pagar en el POS. El pago ya quedó
// acreditado: un fallo aquí solo se registra, nunca revierte el cobro.
async function recordReleasedSeconds(db, stayId) {
  try {
    const { data: stay, error } = await db.from("parking_stays").select("id,entry_at,exit_at,released_payment_snapshot,released_payment_authorization_id").eq("id", stayId).maybeSingle();
    if (error) throw error;
    if (!stay?.released_payment_authorization_id || !stay.exit_at) return;
    const coverage = releasedStayCoverage(stay.released_payment_snapshot, stay.entry_at, stay.exit_at);
    const update = await db.from("parking_stays").update({ released_covered_seconds: coverage.coveredSeconds, released_chargeable_seconds: coverage.chargeableSeconds }).eq("id", stay.id);
    if (update.error) throw update.error;
  } catch (error) {
    console.error("[webpay:released-seconds]", { stayId, code: error?.code, message: error?.message });
  }
}
