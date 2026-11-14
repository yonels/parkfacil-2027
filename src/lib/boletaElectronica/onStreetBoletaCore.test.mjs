import test from "node:test";
import assert from "node:assert/strict";
import { shouldIssueOnStreetBoleta } from "./onStreetBoletaCore.mjs";

const SETTINGS = { api_key_ciphertext: "cifrado", enabled_parking_ids: ["calle-1"] };
const INTENT = { status: "PAID", paid_at: "2026-11-14T10:00:00Z", amount: 1200, parking_id: "calle-1" };

test("emite boleta para un intento PAID con monto y empresa configurada", () => {
  assert.equal(shouldIssueOnStreetBoleta({ intent: INTENT, settings: SETTINGS }), true);
});

test("no emite si el intento no está PAID o no tiene paid_at", () => {
  assert.equal(shouldIssueOnStreetBoleta({ intent: { ...INTENT, status: "PENDING_PAYMENT" }, settings: SETTINGS }), false);
  assert.equal(shouldIssueOnStreetBoleta({ intent: { ...INTENT, paid_at: null }, settings: SETTINGS }), false);
});

test("no emite sin monto, sin API Key, o con el estacionamiento no habilitado", () => {
  assert.equal(shouldIssueOnStreetBoleta({ intent: { ...INTENT, amount: 0 }, settings: SETTINGS }), false);
  assert.equal(shouldIssueOnStreetBoleta({ intent: INTENT, settings: { ...SETTINGS, api_key_ciphertext: null } }), false);
  assert.equal(shouldIssueOnStreetBoleta({ intent: INTENT, settings: { ...SETTINGS, enabled_parking_ids: ["otra-calle"] } }), false);
});
