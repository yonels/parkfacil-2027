import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildPosQuoteSnapshot, signPosQuoteSnapshot, toPagueAquiQuote, verifyPosQuoteSnapshot } from "./parkingStayQuoteService.js";

const TEST_POS_QUOTE_HMAC_SECRET = process.env.POS_QUOTE_HMAC_SECRET || "TEST_POS_QUOTE_HMAC_SECRET_FOR_UNIT_TESTS_ONLY_2026";

if (!process.env.POS_QUOTE_HMAC_SECRET) {
  process.env.POS_QUOTE_HMAC_SECRET = TEST_POS_QUOTE_HMAC_SECRET;
}

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

test("el motor selecciona la tarifa vigente en el timestamp cotizado, nunca en la hora actual implícita", async () => {
  const source = await readFile(new URL("./parkingStayQuoteService.js", import.meta.url), "utf8");
  assert.match(source, /getActiveRate\(db, stay\.parking_id, now\)/);
  assert.match(source, /selectActiveRate\(rates, at\)/);
  assert.doesNotMatch(source, /selectActiveRate\(rates\);/);
});

test("la snapshot POS se firma, expira a 30 segundos y rechaza manipulación", () => {
  const calculatedAt = new Date("2026-08-11T16:44:58.638Z");
  const snapshot = buildPosQuoteSnapshot({
    stay: {
      id: "stay-quote-1",
      code: "ING-123",
      parking_id: "parking-1",
      updated_at: "2026-08-11T16:00:00.000Z",
      rate_id: "rate-1",
      rate_name: "Tarifa minuto",
      billing_mode: "EFFECTIVE_MINUTE",
    },
    quote: {
      elapsedMinutes: 127,
      subtotal: 6350,
      discount: 0,
      net: 5336,
      tax: 1014,
      total: 6350,
      rate: {
        id: "rate-1",
        updatedAt: "2026-08-11T16:40:00.000Z",
        name: "Tarifa minuto",
        billingMode: "EFFECTIVE_MINUTE",
        currency: "CLP",
      },
    },
    calculatedAt,
  });

  assert.equal(snapshot.expiresAt, "2026-08-11T16:45:28.638Z");
  assert.equal(snapshot.signature.length, 64);
  assert.equal(verifyPosQuoteSnapshot({ ...snapshot, signature: undefined }, snapshot.signature, TEST_POS_QUOTE_HMAC_SECRET), true);
  assert.equal(verifyPosQuoteSnapshot({ ...snapshot, totalAmount: 6400, signature: undefined }, snapshot.signature, TEST_POS_QUOTE_HMAC_SECRET), false);
});

test("la firma POS puede generarse con un secreto estable y no depende del cliente", () => {
  const snapshot = {
    stayId: "stay-quote-2",
    parkingId: "parking-1",
    stayUpdatedAt: "2026-08-11T16:00:00.000Z",
    calculatedAt: "2026-08-11T16:44:58.638Z",
    expiresAt: "2026-08-11T16:45:28.638Z",
    rateId: "rate-1",
    rateUpdatedAt: "2026-08-11T16:40:00.000Z",
    elapsedMinutes: 127,
    subtotalAmount: 6350,
    discountAmount: 0,
    netAmount: 5336,
    taxAmount: 1014,
    totalAmount: 6350,
    rateName: "Tarifa minuto",
    billingMode: "EFFECTIVE_MINUTE",
    currency: "CLP",
    couponId: null,
    couponCode: null,
    couponBenefitType: null,
    couponBenefitValue: null,
  };

  const signature = signPosQuoteSnapshot(snapshot, TEST_POS_QUOTE_HMAC_SECRET);
  assert.equal(signature.length, 64);
  assert.equal(verifyPosQuoteSnapshot(snapshot, signature, TEST_POS_QUOTE_HMAC_SECRET), true);
});
