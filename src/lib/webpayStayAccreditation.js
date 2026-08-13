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

  return rpc.data;
}
