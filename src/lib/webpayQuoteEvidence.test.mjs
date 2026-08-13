import test from "node:test";
import assert from "node:assert/strict";

import { signWebpayQuoteEvidence, verifyWebpayQuoteEvidence } from "./webpayQuoteEvidence.mjs";

const secret = "test-only-signing-secret-with-at-least-32-bytes";
const snapshot = {
  stayId: "11111111-1111-4111-8111-111111111111",
  stayUpdatedAt: "2026-08-13T14:10:00.123456+00:00",
  calculatedAt: new Date("2026-08-13T14:12:00.054Z"),
  rateId: "22222222-2222-4222-8222-222222222222",
  rateUpdatedAt: "2026-08-13T10:00:00.000000+00:00",
  rateName: "Tarifa centro",
  billingMode: "EXPIRED_BLOCKS",
  rateBlocksSnapshot: [{
    id: "33333333-3333-4333-8333-333333333333",
    sequence: 1,
    durationSeconds: 1800,
    amount: 50,
    repeatAfter: false,
  }],
  elapsedMinutes: 30,
  subtotalAmount: 50,
  discountAmount: 0,
  netAmount: 42,
  taxAmount: 8,
  totalAmount: 50,
};

const evidence = signWebpayQuoteEvidence(snapshot, secret);

test("evidencia válida verifica y una credencial diferente no puede crearla", () => {
  assert.equal(verifyWebpayQuoteEvidence(snapshot, evidence, secret), true);
  assert.equal(verifyWebpayQuoteEvidence(snapshot, evidence, "unauthorized-secret-with-at-least-32-bytes"), false);
});

for (const [name, mutation] of [
  ["subtotal", { subtotalAmount: 51 }],
  ["total", { totalAmount: 51 }],
  ["discount", { discountAmount: 1 }],
  ["net", { netAmount: 41 }],
  ["tax", { taxAmount: 9 }],
  ["stayId", { stayId: "44444444-4444-4444-8444-444444444444" }],
  ["calculatedAt", { calculatedAt: new Date("2026-08-13T14:13:00.054Z") }],
  ["rateId", { rateId: "55555555-5555-4555-8555-555555555555" }],
  ["rate version", { rateUpdatedAt: "2026-08-13T10:01:00.000000+00:00" }],
  ["blocks", { rateBlocksSnapshot: [{ ...snapshot.rateBlocksSnapshot[0], amount: 51 }] }],
]) {
  test(`modificar ${name} invalida la evidencia`, () => {
    assert.equal(verifyWebpayQuoteEvidence({ ...snapshot, ...mutation }, evidence, secret), false);
  });
}

test("evidencia ausente o mal formada se rechaza", () => {
  assert.equal(verifyWebpayQuoteEvidence(snapshot, null, secret), false);
  assert.equal(verifyWebpayQuoteEvidence(snapshot, "not-a-signature", secret), false);
});

test("una clave débil o ausente no puede firmar", () => {
  assert.throws(() => signWebpayQuoteEvidence(snapshot, "short"), /NOT_CONFIGURED/);
  assert.throws(() => signWebpayQuoteEvidence(snapshot, ""), /NOT_CONFIGURED/);
});
