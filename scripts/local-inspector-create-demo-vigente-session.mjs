/******************************************************************
 * Sesión de demostración VIGENTE para /inspector (2026-08-31).
 *
 * Crea UNA sesión real de 60 minutos (mismo camino 100% real que un pago
 * aprobado por Webpay: intent -> transacción -> claim -> finalize vía
 * finalize_authorized_on_street_payment) para una patente de demostración
 * fija -- reutiliza EXACTAMENTE los mismos helpers/contrato que
 * scripts/local-on-street-seed-reportes-pagos.mjs (a su vez tomados de
 * local-on-street-extension-e2e.mjs). A diferencia de ese seed, aquí NO se
 * hace backdate de nada: el objetivo es que expires_at quede en el futuro
 * real (ahora + 60 minutos), para que Inspector la muestre VIGENTE con
 * tiempo restante real y bloquee la fiscalización indebida.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-inspector-create-demo-vigente-session.mjs
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

const DEMO_PLATE = "DEMOVIG1";
const DEMO_PHONE = "+56912345678";
const DEMO_MINUTES = 60;

// --- Fixture real: el mismo Estacionamiento ON_STREET local con tarifa activa ---
const locations = fail(await db.from("on_street_qr_locations").select("id,public_code,parking_id,sector_id,street_id,segment_id").eq("status", "ACTIVE").limit(1));
assert.ok(locations?.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
const location = locations[0];
const rates = fail(await db.from("parking_rates").select("id,minute_amount,currency").eq("parking_id", location.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").limit(1));
assert.ok(rates?.length, "LOCAL_ACTIVE_RATE_REQUIRED");
const rate = Number(rates[0].minute_amount);
const rateId = rates[0].id;
const currency = rates[0].currency || "CLP";

async function insertIntent() {
  const amount = Math.round(DEMO_MINUTES * rate);
  const row = {
    qr_location_id: location.id, parking_id: location.parking_id,
    license_plate_normalized: DEMO_PLATE, phone_normalized: DEMO_PHONE,
    operation_type: "INITIAL", target_session_id: null,
    purchased_minutes: DEMO_MINUTES, rate_id: rateId, rate_per_minute: rate, amount, currency,
    location_snapshot: {}, rate_snapshot: {}, idempotency_key: `demo-vigente-${randomUUID()}`, status: "PENDING_PAYMENT",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  return fail(await db.from("on_street_payment_intents").insert(row).select("id,public_token,created_at").single());
}

const intent = await insertIntent();
const buyOrder = `PFDEMO${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
const idem = `demo-vigente-${randomUUID()}`;

const tx = await db.rpc("create_on_street_payment_transaction", { p_intent_token: intent.public_token, p_idempotency_key: `${idem}-tx`, p_buy_order: buyOrder, p_provider_session_id: providerSessionId });
if (tx.error) throw tx.error;
const transactionId = tx.data.transactionId;

const token = randomUUID();
fail(await db.from("payment_transactions").update({ status: "REDIRECTED", token_ws_hash: hashPaymentToken(token), token_ws_encrypted: encryptPaymentToken(token), gateway_url: "https://webpay3gint.transbank.cl/simulate", redirected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", transactionId).eq("status", "CREATED").select("id").single());

const claimResult = await db.rpc("claim_on_street_webpay_commit", { p_token_hash: hashPaymentToken(token) });
if (claimResult.error) throw claimResult.error;

const amount = Math.round(DEMO_MINUTES * rate);
const response = { status: "AUTHORIZED", response_code: 0, buy_order: buyOrder, amount, authorization_code: `AUT${randomUUID().slice(0, 6).toUpperCase()}`, payment_type_code: "VD" };
const finalizeResult = await db.rpc("finalize_authorized_on_street_payment", { p_transaction_id: transactionId, p_provider_status: response.status, p_authorization_code: response.authorization_code, p_response_code: response.response_code, p_provider_response: response, p_payment_type: webpayPaymentType("VD"), p_provider_payment_type_code: "VD" });
if (finalizeResult.error) throw finalizeResult.error;
assert.equal(finalizeResult.data.result, "COMMITTED", "El pago de demostración debía quedar COMMITTED");

const session = fail(await db.from("on_street_pilot_sessions").select("id,license_plate_normalized,status,started_at,expires_at").eq("id", finalizeResult.data.sessionId).single());

console.log(`[DEMO] Sesión VIGENTE creada -- patente ${session.license_plate_normalized}, expira ${session.expires_at} (en ~${DEMO_MINUTES} minutos desde ahora).`);
console.log(`\nPatente de demostración VIGENTE para probar en Inspector: ${DEMO_PLATE}`);
