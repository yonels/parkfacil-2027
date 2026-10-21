import test from "node:test";
import assert from "node:assert/strict";
import {
  canStoreCardPaymentReference,
  missingCardPaymentReferenceColumn,
  validateCardPaymentReference,
} from "./cardPaymentReference.mjs";

test("referencia TUU: opcional y solo válida con CARD, TUU y 12 dígitos", () => {
  assert.equal(validateCardPaymentReference("CARD", undefined), null);
  assert.equal(validateCardPaymentReference("CARD", null), null);
  assert.deepEqual(validateCardPaymentReference("CARD", { provider: "TUU", reference: "000012345678" }), {
    provider: "TUU",
    reference: "000012345678",
  });
  assert.throws(() => validateCardPaymentReference("CASH", { provider: "TUU", reference: "000012345678" }));
  assert.throws(() => validateCardPaymentReference("CARD", { provider: "OTRO", reference: "000012345678" }));
  assert.throws(() => validateCardPaymentReference("CARD", { provider: "TUU", reference: "12345" }));
  assert.throws(() => validateCardPaymentReference("CARD", { provider: "TUU" }));
});

function fakeDb(result) {
  return { from: () => ({ select: () => ({ limit: async () => result }) }) };
}

test("referencia TUU: sin migración se omite; otros errores no se ocultan", async () => {
  assert.equal(await canStoreCardPaymentReference(fakeDb({ error: null })), true);
  const missing = { code: "42703", message: 'column parking_stays.card_payment_reference does not exist' };
  assert.equal(missingCardPaymentReferenceColumn(missing), true);
  assert.equal(await canStoreCardPaymentReference(fakeDb({ error: missing })), false);
  await assert.rejects(() => canStoreCardPaymentReference(fakeDb({ error: { code: "500", message: "down" } })));
  assert.equal(missingCardPaymentReferenceColumn({ code: "42703", message: "column payment_card_type does not exist" }), false);
});
