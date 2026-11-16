/******************************************************************
 * Set QA para la prueba Inspector desde Android vía túnel Cloudflare
 * (2026-09-02): QA1001/QA1002 vencidas (aptas para fiscalización) y
 * QA1003 vigente (solo consulta, comparación).
 *
 * Mismo patrón 100% real que scripts/local-inspector-create-qa-set.mjs
 * (pago simulado Webpay real: intent -> transacción -> claim -> finalize
 * vía finalize_authorized_on_street_payment) -- NO se inventa estructura
 * ni se llama a Transbank/SMS/register_on_street_inspection real. Nunca
 * se hace backdate de expires_at: las "vencidas" quedan vencidas por el
 * simple paso del tiempo real (mínimo permitido: 1 minuto).
 *
 * Teléfonos: patrón sintético "+569000000XX" ya establecido en este repo
 * para datos QA (nunca un número real de una persona -- este repo es
 * público en GitHub). Usa el rango .011/.012/.013, distinto del usado por
 * local-inspector-create-qa-set.mjs (.001/.002/.004) para evitar
 * colisión con el índice único "on_street_one_active_phone_location_idx"
 * (una sola sesión ACTIVE por ubicación+teléfono a la vez).
 *
 * Idempotente por plate: si ya existe una sesión en el estado buscado, no
 * crea otra.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-inspector-create-qa-android-set.mjs
 *
 * Solo contra Supabase LOCAL.
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
    location_snapshot: {}, rate_snapshot: {}, idempotency_key: `qa-android-${randomUUID()}`, status: "PENDING_PAYMENT",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("id,public_token,created_at").single());

  const buyOrder = `PFQAAND${randomUUID().replace(/-/g, "").slice(0, 9)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const idem = `qa-android-${randomUUID()}`;

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
  assert.equal(finalizeResult.data.result, "COMMITTED", `Pago QA (${plate}) debía quedar COMMITTED`);

  return fail(await db.from("on_street_pilot_sessions").select("id,license_plate_normalized,phone_normalized,status,started_at,expires_at,purchased_minutes,qr_location_id").eq("id", finalizeResult.data.sessionId).single());
}

async function sesionActivaExistente(plate) {
  const rows = fail(await db.from("on_street_pilot_sessions").select("id,status,expires_at,phone_normalized,qr_location_id").eq("license_plate_normalized", plate).eq("status", "ACTIVE").gt("expires_at", new Date().toISOString()).limit(1));
  return rows?.[0] || null;
}

async function sesionVencidaSinFiscalizarExistente(plate) {
  const rows = fail(await db.from("on_street_pilot_sessions").select("id,status,expires_at,phone_normalized,qr_location_id").eq("license_plate_normalized", plate).lt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1));
  const candidate = rows?.[0];
  if (!candidate) return null;
  const inspections = fail(await db.from("on_street_inspections").select("id").eq("session_id", candidate.id).limit(1));
  return inspections?.length ? null : candidate;
}

const plan = [
  { plate: "QA1001", phone: "+56900000011", minutes: 1, kind: "vencida", label: "QA1001 (VENCIDA, apta para fiscalización)" },
  { plate: "QA1002", phone: "+56900000012", minutes: 1, kind: "vencida", label: "QA1002 (VENCIDA, apta para fiscalización)" },
  { plate: "QA1003", phone: "+56900000013", minutes: 30, kind: "vigente", label: "QA1003 (VIGENTE, solo consulta/comparación)" },
];

console.log(`[QA-ANDROID] Ubicación: ${location.public_code} (${location.id})`);
console.log(`[QA-ANDROID] Ahora mismo: ${new Date().toISOString()}\n`);

const resultados = [];
for (const item of plan) {
  const existing = item.kind === "vigente" ? await sesionActivaExistente(item.plate) : await sesionVencidaSinFiscalizarExistente(item.plate);
  if (existing) {
    console.log(`[QA-ANDROID] ${item.label}: ya existe sesión ${existing.id} (${existing.status}, expira ${existing.expires_at}) -- no se crea otra (idempotente).`);
    resultados.push({ plate: item.plate, sessionId: existing.id, status: existing.status, expiresAt: existing.expires_at, qrLocationId: existing.qr_location_id });
    continue;
  }
  const session = await crearSesion(item);
  console.log(`[QA-ANDROID] ${item.label}: sesión creada ${session.id} -- expira ${session.expires_at}, ${session.purchased_minutes} min.`);
  resultados.push({ plate: item.plate, sessionId: session.id, status: session.status, expiresAt: session.expires_at, qrLocationId: session.qr_location_id });
}

console.log("\n[QA-ANDROID] Las patentes VENCIDA quedan vencidas por el simple paso del tiempo real (~1 minuto desde su creación), sin editar expires_at a mano. Espera ~1 minuto antes de fiscalizar QA1001/QA1002.");
console.log("\n[QA-ANDROID] RESUMEN JSON:");
console.log(JSON.stringify(resultados, null, 2));
