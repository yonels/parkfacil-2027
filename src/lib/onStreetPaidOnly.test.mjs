import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("la transición retira todas las RPC que crean o extienden sesiones sin Webpay", async () => {
  const sql = await read("supabase/migrations/20260824170000_remove_on_street_unpaid_session_rpcs.sql");
  for (const signature of [
    "create_on_street_pilot_session_free(text,text,text)",
    "create_on_street_pilot_session(text,text,text,integer)",
    "extend_on_street_pilot_session(uuid,integer)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}`));
    assert.match(sql, new RegExp(`drop function if exists public\\.${signature.replace(/[()]/g, "\\$&")}`));
  }
  assert.doesNotMatch(sql, /\bcascade\b/i);
  assert.doesNotMatch(sql, /\b(delete|truncate|update)\b/i);
});

test("el código ejecutable no conserva callers de las RPC sin pago", async () => {
  const repository = await read("src/lib/onStreetPilotRepository.js");
  assert.doesNotMatch(repository, /create_on_street_pilot_session(?:_free)?/);
  assert.doesNotMatch(repository, /extend_on_street_pilot_session/);

  const publicPaymentRoute = await read("src/app/api/public/on-street/payment-intents/route.js");
  const extensionRoute = await read("src/app/api/public/on-street/sessions/[token]/extension-intents/route.js");
  const legacyExtensionRoute = await read("src/app/api/public/on-street/sessions/[token]/extend/route.js");
  assert.match(publicPaymentRoute, /createInitialPaymentIntent/);
  assert.match(extensionRoute, /createExtensionPaymentIntent/);
  assert.match(legacyExtensionRoute, /PREPAID_PAYMENT_REQUIRED/);
  assert.doesNotMatch(`${publicPaymentRoute}\n${extensionRoute}\n${legacyExtensionRoute}`, /\.rpc\(/);
});

test("la sesión ACTIVE continúa originándose en la finalización autorizada de Webpay", async () => {
  const service = await read("src/lib/onStreetPaymentService.js");
  const webpayMigration = await read("supabase/migrations/20260824160000_on_street_qr_license_plate.sql");
  assert.match(service, /finalizeAuthorizedPayment/);
  assert.match(webpayMigration, /create or replace function public\.finalize_authorized_on_street_payment/);
  assert.match(webpayMigration, /i\.license_plate_normalized,i\.phone_normalized,'ACTIVE'/);
});

test("la superficie pública informa monto pagado sin terminología de simulación", async () => {
  const sessionRoute = await read("src/app/api/public/on-street/sessions/[token]/route.js");
  const sessionUi = await read("src/components/on-street/PublicParkingSession.js");
  assert.match(sessionRoute, /amountPaid:Number\(data\.session\.amount_paid\?\?data\.session\.simulated_amount\)/);
  assert.doesNotMatch(sessionRoute, /simulatedAmount:/);
  assert.match(sessionUi, /money\(s\.amountPaid\)/);
  assert.doesNotMatch(sessionUi, /s\.simulatedAmount/);
});
