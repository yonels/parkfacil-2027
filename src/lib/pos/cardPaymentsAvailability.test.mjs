import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { posCardPaymentsEnabled } from "./cardPaymentsAvailability.mjs";

test("D2: tarjeta apagada en producción salvo POS_CARD_PAYMENTS_ENABLED=true", () => {
  assert.equal(posCardPaymentsEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(posCardPaymentsEnabled({ VERCEL_ENV: "production", POS_CARD_PAYMENTS_ENABLED: "true" }), true);
  assert.equal(posCardPaymentsEnabled({ VERCEL_ENV: "production", POS_CARD_PAYMENTS_ENABLED: "TRUE " }), true);
});

test("D2: Preview (QA) y local siguen con tarjeta; false la apaga en cualquier ambiente", () => {
  assert.equal(posCardPaymentsEnabled({ VERCEL_ENV: "preview" }), true);
  assert.equal(posCardPaymentsEnabled({}), true);
  assert.equal(posCardPaymentsEnabled({ VERCEL_ENV: "preview", POS_CARD_PAYMENTS_ENABLED: "false" }), false);
});

test("D2: el POS y el servidor respetan el interruptor", () => {
  const terminal = readFileSync(new URL("../../components/pos/PosTerminal.js", import.meta.url), "utf8");
  assert.match(terminal, /\{cardPaymentsEnabled \? \(/);
  assert.match(terminal, /setCardPaymentsEnabled\(summary\.payload\?\.data\?\.cardPaymentsEnabled === true\)/);
  const stays = readFileSync(new URL("../../app/api/pos/stays/route.js", import.meta.url), "utf8");
  assert.match(stays, /cardPaymentsEnabled: posCardPaymentsEnabled\(\)/);
  const dataEntry = readFileSync(new URL("../../app/api/data-entry/route.js", import.meta.url), "utf8");
  assert.match(dataEntry, /isPosRequest && input\.paymentMethod === "CARD" && !posCardPaymentsEnabled\(\)/);
  assert.match(dataEntry, /CARD_PAYMENTS_DISABLED/);
});
