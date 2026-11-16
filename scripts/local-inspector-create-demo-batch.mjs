/******************************************************************
 * Lote de patentes de demostración para Inspector (2026-08-31).
 *
 * Todas las anteriores (PRUEB0xx, DEMOSMS1, DEMOVIG1) ya fueron
 * fiscalizadas en pruebas reales -- este script genera un lote fresco,
 * mismo camino 100% real que un pago aprobado por Webpay (intent ->
 * transacción -> claim -> finalize vía finalize_authorized_on_street_payment),
 * igual que los scripts anteriores de esta misma tarea. Nunca llama a
 * register_on_street_inspection ni a ningún endpoint de SMS: la
 * fiscalización queda para hacerse manualmente desde Inspector.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-inspector-create-demo-batch.mjs
 *
 * Solo contra Supabase LOCAL (mismo guard que el resto de scripts locales).
 ******************************************************************/
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hashPaymentToken, encryptPaymentToken } from "../src/lib/payments/paymentTokenCrypto.mjs";
import { webpayPaymentType } from "../src/lib/payments/webpayCore.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.match(url || "", /^http:\/\/(127\.0\.0\.1|localhost):54321$/, "Este script SOLO corre contra Supabase LOCAL");
assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY requerida");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (r) => { if (r.error) throw r.error; return r.data; };

const locations = fail(await db.from("on_street_qr_locations").select("id,public_code,parking_id,sector_id,street_id,segment_id").eq("status", "ACTIVE").limit(1));
assert.ok(locations?.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
const location = locations[0];
const rates = fail(await db.from("parking_rates").select("id,minute_amount,currency").eq("parking_id", location.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").limit(1));
assert.ok(rates?.length, "LOCAL_ACTIVE_RATE_REQUIRED");
const rate = Number(rates[0].minute_amount);
const rateId = rates[0].id;
const currency = rates[0].currency || "CLP";

async function crearSesion({ plate, phone, minutes }) {
  const amount = Math.round(minutes * rate);
  const intent = fail(await db.from("on_street_payment_intents").insert({
    qr_location_id: location.id, parking_id: location.parking_id,
    license_plate_normalized: plate, phone_normalized: phone,
    operation_type: "INITIAL", target_session_id: null,
    purchased_minutes: minutes, rate_id: rateId, rate_per_minute: rate, amount, currency,
    location_snapshot: {}, rate_snapshot: {}, idempotency_key: `demo-batch-${randomUUID()}`, status: "PENDING_PAYMENT",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("id,public_token,created_at").single());

  const buyOrder = `PFBATCH${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const idem = `demo-batch-${randomUUID()}`;

  const tx = await db.rpc("create_on_street_payment_transaction", { p_intent_token: intent.public_token, p_idempotency_key: `${idem}-tx`, p_buy_order: buyOrder, p_provider_session_id: providerSessionId });
  if (tx.error) throw tx.error;
  const transactionId = tx.data.transactionId;

  const token = randomUUID();
  fail(await db.from("payment_transactions").update({ status: "REDIRECTED", token_ws_hash: hashPaymentToken(token), token_ws_encrypted: encryptPaymentToken(token), gateway_url: "https://webpay3gint.transbank.cl/simulate", redirected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", transactionId).eq("status", "CREATED").select("id").single());

  const claimResult = await db.rpc("claim_on_street_webpay_commit", { p_token_hash: hashPaymentToken(token) });
  if (claimResult.error) throw claimResult.error;

  const response = { status: "AUTHORIZED", response_code: 0, buy_order: buyOrder, amount, authorization_code: `AUT${randomUUID().slice(0, 6).toUpperCase()}`, payment_type_code: "VD" };
  const finalizeResult = await db.rpc("finalize_authorized_on_street_payment", { p_transaction_id: transactionId, p_provider_status: response.status, p_authorization_code: response.authorization_code, p_response_code: response.response_code, p_provider_response: response, p_payment_type: webpayPaymentType("VD"), p_provider_payment_type_code: "VD" });
  if (finalizeResult.error) throw finalizeResult.error;
  assert.equal(finalizeResult.data.result, "COMMITTED", `Pago de demostración (${plate}) debía quedar COMMITTED`);

  const session = fail(await db.from("on_street_pilot_sessions").select("license_plate_normalized,phone_normalized,expires_at").eq("id", finalizeResult.data.sessionId).single());
  return session;
}

// license_plate_normalized exige ^[A-Z0-9]{4,8}$ -- máximo 8 caracteres.
const suffix = Date.now().toString().slice(-4);
const plan = [
  { plate: `DV${suffix}1`, phone: "+56987200001", minutes: 1, label: "VENCIDA" },
  { plate: `DV${suffix}2`, phone: "+56987200002", minutes: 1, label: "VENCIDA" },
  { plate: `DV${suffix}3`, phone: "+56987200003", minutes: 1, label: "VENCIDA" },
  { plate: `DG${suffix}9`, phone: "+56987200009", minutes: 60, label: "VIGENTE" },
];

console.log(`[BATCH] Ahora mismo: ${new Date().toISOString()}\n`);
for (const item of plan) {
  const session = await crearSesion(item);
  console.log(`[BATCH] ${item.label.padEnd(8)} patente=${session.license_plate_normalized}  telefono=${session.phone_normalized}  expira=${session.expires_at}`);
}
console.log("\n[BATCH] Las patentes VENCIDA quedan vencidas por el simple paso del tiempo real (~1 minuto), sin editar expires_at a mano.");
