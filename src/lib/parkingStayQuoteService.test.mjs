import test from "node:test";
import assert from "node:assert/strict";

import { toPagueAquiQuote } from "./parkingStayQuoteService.js";

test("cotización pagable conserva duración, tarifa y monto", () => {
  const payload = toPagueAquiQuote({
    stay: {
      id: "stay-1",
      code: "ING-123",
      parking_id: "parking-1",
      license_plate: "CXPY-93",
      entry_at: "2026-08-11T14:37:47.624Z",
      rate_id: null,
      rate_name: null,
      billing_mode: null,
    },
    parkingName: "Parking Centro",
    quote: {
      blocked: false,
      elapsedMinutes: 127,
      total: 6350,
      rate: {
        id: "rate-1",
        name: "Tarifa minuto",
        billingMode: "EFFECTIVE_MINUTE",
        currency: "CLP",
      },
      charge: {
        chargedMinutes: 127,
      },
    },
    calculatedAt: new Date("2026-08-11T16:44:58.638Z"),
  });

  assert.equal(payload.payable, true);
  assert.equal(payload.amount, 6350);
  assert.equal(payload.elapsedMinutes, 127);
  assert.equal(payload.billableMinutes, 127);
  assert.equal(payload.rateName, "Tarifa minuto");
});

test("cotización bloqueada no fuerza monto cero", () => {
  const payload = toPagueAquiQuote({
    stay: {
      id: "stay-2",
      code: "ING-456",
      parking_id: "parking-1",
      license_plate: "CXPY-93",
      entry_at: "2026-08-11T14:37:47.624Z",
      rate_id: null,
      rate_name: null,
      billing_mode: null,
    },
    parkingName: "Parking Centro",
    quote: {
      blocked: true,
      reason: "ACTIVE_RATE_NOT_FOUND",
      elapsedMinutes: 127,
    },
    calculatedAt: new Date("2026-08-11T16:44:58.638Z"),
  });

  assert.equal(payload.payable, false);
  assert.equal(payload.amount, null);
  assert.equal(payload.blockedReason, "NO_ACTIVE_RATE");
  assert.equal(payload.elapsedMinutes, 127);
});
