import test from "node:test";
import assert from "node:assert/strict";
import { shouldIssueWebpayBoleta } from "./webpayBoletaCore.mjs";

const SETTINGS = { api_key_ciphertext: "cifrado", enabled_parking_ids: ["p1"] };
const STAY_WEBPAY = { status: "PAID", payment_method: "CARD", card_payment_provider: null, total_amount: 1200, payment_code: "OS-1", parking_id: "p1" };

test("emite boleta para un pago Webpay (CARD, sin card_payment_provider)", () => {
  assert.equal(shouldIssueWebpayBoleta({ stay: STAY_WEBPAY, settings: SETTINGS }), true);
});

test("no emite para un pago TUU (card_payment_provider = TUU)", () => {
  assert.equal(shouldIssueWebpayBoleta({ stay: { ...STAY_WEBPAY, card_payment_provider: "TUU" }, settings: SETTINGS }), false);
});

test("no emite para efectivo", () => {
  assert.equal(shouldIssueWebpayBoleta({ stay: { ...STAY_WEBPAY, payment_method: "CASH" }, settings: SETTINGS }), false);
});

test("no emite si la estadía no está PAID, sin monto, o sin código de pago", () => {
  assert.equal(shouldIssueWebpayBoleta({ stay: { ...STAY_WEBPAY, status: "OPEN" }, settings: SETTINGS }), false);
  assert.equal(shouldIssueWebpayBoleta({ stay: { ...STAY_WEBPAY, total_amount: 0 }, settings: SETTINGS }), false);
  assert.equal(shouldIssueWebpayBoleta({ stay: { ...STAY_WEBPAY, payment_code: "" }, settings: SETTINGS }), false);
});

test("no emite sin API Key o sin el estacionamiento habilitado", () => {
  assert.equal(shouldIssueWebpayBoleta({ stay: STAY_WEBPAY, settings: { ...SETTINGS, api_key_ciphertext: null } }), false);
  assert.equal(shouldIssueWebpayBoleta({ stay: STAY_WEBPAY, settings: { ...SETTINGS, enabled_parking_ids: ["otro"] } }), false);
});
