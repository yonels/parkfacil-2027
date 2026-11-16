/******************************************************************
 * Datos de prueba para "Reportes On Street -> Pagos" (2026-08-30).
 *
 * Inserta 10 payment_transactions REALES y coherentes con el modelo
 * existente (intent -> transacción -> finalize, EXACTAMENTE el mismo
 * camino que usa el pago real vía Webpay -- ver
 * local-on-street-extension-e2e.mjs, del que se reutiliza el mismo patrón
 * de helpers), simulando la respuesta ya AUTORIZADA/RECHAZADA de Transbank
 * (igual contrato que processWebpayReturn usa tras un commit real) --
 * NUNCA se llama a Transbank ni se genera un cobro real.
 *
 * A diferencia de los scripts *-e2e.mjs de este proyecto (que limpian sus
 * propios datos al terminar), este script SEED deja los datos insertados
 * -- es justamente lo que se pidió: "Dejar localhost listo para revisar
 * visualmente la tabla con los 10 pagos".
 *
 * Distribución (8 aprobados + 2 rechazados = 10 payment_transactions):
 *  - Medio de pago: 3 Débito + 5 Crédito (aprobados) + 2 rechazados
 *    (sin payment_type, igual que un rechazo real de Transbank).
 *  - Tipo: 6 INICIAL + 2 EXTENSIÓN (sobre 2 de las sesiones iniciales) +
 *    2 intentos INICIAL rechazados.
 *  - 8 patentes distintas (una extensión reutiliza la patente de su
 *    propia sesión -- exigido por finalize_authorized_on_street_payment,
 *    PILOT_SESSION_IDENTITY_MISMATCH si no calzara).
 *  - Montos: 10 valores todos distintos.
 *  - Fechas: hoy y los 6 días anteriores (7 días distintos), vía
 *    backdating de on_street_payment_intents.created_at y
 *    payment_transactions.created_at/committed_at -- las únicas dos
 *    tablas de este flujo sin triggers de fecha/estado (confirmado contra
 *    supabase/migrations antes de escribir este script), así que
 *    retrasar su fecha no dispara efectos secundarios (a diferencia de
 *    on_street_pilot_sessions, que si tiene un trigger sobre expires_at/
 *    status -- por eso las sesiones de prueba quedan con su fecha real de
 *    creación, sin backdate).
 *  - Ubicaciones: 2 tramos reales dentro del único Estacionamiento ON
 *    STREET local con tarifa activa ("On Street Test E2E" / Sector Test /
 *    Calle Test) -- Tramo 1 (ya tenía QR) y "VERIFY tramo" (tramo
 *    existente sin QR todavía; se le crea una Ubicación QR real para
 *    poder distribuir pagos en un segundo tramo, sin inventar
 *    Estacionamiento/Área/Calle nuevos).
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-on-street-seed-reportes-pagos.mjs
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

// --- Fixture real: el único Estacionamiento ON_STREET local con tarifa activa ---
const locations = fail(await db.from("on_street_qr_locations").select("id,public_code,parking_id,sector_id,street_id,segment_id").eq("status", "ACTIVE").limit(50));
assert.ok(locations?.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
const locationA = locations[0];
const rates = fail(await db.from("parking_rates").select("id,minute_amount,currency,area_id").eq("parking_id", locationA.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").limit(1));
assert.ok(rates?.length, "LOCAL_ACTIVE_RATE_REQUIRED");
const rate = Number(rates[0].minute_amount);
const rateId = rates[0].id;
const currency = rates[0].currency || "CLP";
console.log(`[SEED] Ubicación base ${locationA.public_code}, tarifa/min=${rate} ${currency}`);

// Segunda ubicación (segundo tramo del mismo Estacionamiento/Área/Calle) --
// se crea si el tramo ya existe sin QR (caso real de este entorno local:
// "VERIFY tramo"), reutilizando la misma Área/Calle/tarifa, nunca
// inventando jerarquía nueva.
let locationB = null;
const segments = fail(await db.from("parking_street_segments").select("id,name,street_id,area_id").eq("parking_id", locationA.parking_id));
const usedSegmentIds = new Set(locations.map((l) => l.segment_id));
const freeSegment = segments.find((s) => !usedSegmentIds.has(s.id));
if (freeSegment) {
  locationB = fail(await db.from("on_street_qr_locations").insert({
    parking_id: locationA.parking_id, sector_id: freeSegment.area_id, street_id: freeSegment.street_id, segment_id: freeSegment.id,
    rate_id: rateId, label: "Seed Reportes Pagos", status: "ACTIVE",
  }).select("id,public_code,parking_id,sector_id,street_id,segment_id").single());
  console.log(`[SEED] Segunda ubicación creada en tramo existente "${freeSegment.name}" (${locationB.public_code}).`);
} else {
  console.log("[SEED] No hay un segundo tramo libre -- se usa una sola ubicación para las 10 filas.");
  locationB = locationA;
}

// --- Helpers RPC: MISMO contrato que local-on-street-extension-e2e.mjs / onStreetPaymentService.js ---
async function insertIntent({ location, operationType, targetSessionId, minutes, plate, phone, idempotencyKey }) {
  const amount = Math.round(minutes * rate);
  const row = {
    qr_location_id: location.id, parking_id: location.parking_id,
    license_plate_normalized: plate, phone_normalized: phone,
    operation_type: operationType, target_session_id: targetSessionId,
    purchased_minutes: minutes, rate_id: rateId, rate_per_minute: rate, amount, currency,
    location_snapshot: {}, rate_snapshot: {}, idempotency_key: idempotencyKey, status: "PENDING_PAYMENT",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  return fail(await db.from("on_street_payment_intents").insert(row).select("id,public_token,created_at").single());
}
async function createTransaction(intentToken, idempotencyKey, buyOrder, providerSessionId) {
  const r = await db.rpc("create_on_street_payment_transaction", { p_intent_token: intentToken, p_idempotency_key: idempotencyKey, p_buy_order: buyOrder, p_provider_session_id: providerSessionId });
  if (r.error) throw r.error;
  return r.data.transactionId;
}
async function redirectTransaction(transactionId, token) {
  return fail(await db.from("payment_transactions").update({ status: "REDIRECTED", token_ws_hash: hashPaymentToken(token), token_ws_encrypted: encryptPaymentToken(token), gateway_url: "https://webpay3gint.transbank.cl/simulate", redirected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", transactionId).eq("status", "CREATED").select("*").single());
}
async function claim(token) {
  const r = await db.rpc("claim_on_street_webpay_commit", { p_token_hash: hashPaymentToken(token) });
  if (r.error) throw r.error;
  return r.data;
}
async function finalizeApproved(transactionId, amount, buyOrder, paymentTypeCode) {
  const response = { status: "AUTHORIZED", response_code: 0, buy_order: buyOrder, amount, authorization_code: `AUT${randomUUID().slice(0, 6).toUpperCase()}`, payment_type_code: paymentTypeCode };
  const r = await db.rpc("finalize_authorized_on_street_payment", { p_transaction_id: transactionId, p_provider_status: response.status, p_authorization_code: response.authorization_code, p_response_code: response.response_code, p_provider_response: response, p_payment_type: webpayPaymentType(paymentTypeCode), p_provider_payment_type_code: paymentTypeCode });
  if (r.error) throw r.error;
  return r.data;
}
// Rechazo real de Transbank (nunca llega a finalize): mismo camino que
// processWebpayReturn cuando isAuthorizedWebpayResponse es false -- se
// reproduce igual que el escenario "RECHAZADO_POR_TRANSBANK" del e2e de
// extensiones.
async function markRejected(transactionId) {
  return fail(await db.from("payment_transactions").update({ status: "REJECTED", provider_status: "FAILED", failed_at: new Date().toISOString() }).eq("id", transactionId).neq("status", "COMMITTED").select("id").single());
}
async function backdate({ intentId, transactionId, at }) {
  const iso = at.toISOString();
  fail(await db.from("on_street_payment_intents").update({ created_at: iso, updated_at: iso }).eq("id", intentId).select("id").single());
  fail(await db.from("payment_transactions").update({ created_at: iso }).eq("id", transactionId).select("id").single());
}
async function backdateCommitted({ intentId, transactionId, at }) {
  await backdate({ intentId, transactionId, at });
  fail(await db.from("payment_transactions").update({ committed_at: at.toISOString(), updated_at: at.toISOString() }).eq("id", transactionId).select("id").single());
  // paid_at de la intención sigue el mismo instante financiero -- coherente
  // con finalize_authorized_on_street_payment, que siempre iguala paid_at
  // y committed_at al mismo v_now.
  fail(await db.from("on_street_payment_intents").update({ paid_at: at.toISOString() }).eq("id", intentId).select("id").single());
}

const suffix = randomUUID().replace(/\D/g, "").padEnd(6, "0").slice(0, 6);
const daysAgo = (n, hour) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(hour, 15 + n, 0, 0); return d; };
let created = [];

async function approvedCycle({ location, operationType, targetSessionId, minutes, plate, phone, at, paymentTypeCode, label }) {
  const idem = `seed-pagos-${label}-${randomUUID()}`;
  const intent = await insertIntent({ location, operationType, targetSessionId, minutes, plate, phone, idempotencyKey: idem });
  const buyOrder = `PFSEED${label}${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(intent.public_token, `${idem}-tx`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);
  const amount = Math.round(minutes * rate);
  const outcome = await finalizeApproved(transactionId, amount, buyOrder, paymentTypeCode);
  assert.equal(outcome.result, "COMMITTED", `Pago ${label} debía quedar COMMITTED`);
  await backdateCommitted({ intentId: intent.id, transactionId, at });
  console.log(`[SEED] #${label} COMMITTED ${webpayPaymentType(paymentTypeCode)} ${operationType} plate=${plate} amount=${amount} at=${at.toISOString().slice(0, 10)}`);
  created.push({ label, transactionId, status: "COMMITTED", amount, plate, at: at.toISOString() });
  return { transactionId, sessionId: outcome.sessionId, amount };
}

async function rejectedCycle({ location, minutes, plate, phone, at, label }) {
  const idem = `seed-pagos-${label}-${randomUUID()}`;
  const intent = await insertIntent({ location, operationType: "INITIAL", targetSessionId: null, minutes, plate, phone, idempotencyKey: idem });
  const buyOrder = `PFSEED${label}${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(intent.public_token, `${idem}-tx`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);
  await markRejected(transactionId);
  await backdate({ intentId: intent.id, transactionId, at });
  const amount = Math.round(minutes * rate);
  console.log(`[SEED] #${label} REJECTED plate=${plate} amount(intentado)=${amount} at=${at.toISOString().slice(0, 10)}`);
  created.push({ label, transactionId, status: "REJECTED", amount, plate, at: at.toISOString() });
}

// 1) INITIAL DEBIT -- hoy, ubicación A
await approvedCycle({ location: locationA, operationType: "INITIAL", minutes: 20, plate: `PRUEB01${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}01`, at: daysAgo(0, 9), paymentTypeCode: "VD", label: "01" });

// 2) INITIAL CREDIT -- ayer, ubicación A (queda con sesión activa para extender en #3)
const p2 = await approvedCycle({ location: locationA, operationType: "INITIAL", minutes: 45, plate: `PRUEB02${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}02`, at: daysAgo(1, 10), paymentTypeCode: "VN", label: "02" });
// 3) EXTENSION CREDIT sobre la sesión de #2 -- mismo día, misma patente/teléfono (exigido por finalize)
await approvedCycle({ location: locationA, operationType: "EXTENSION", targetSessionId: p2.sessionId, minutes: 15, plate: `PRUEB02${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}02`, at: daysAgo(1, 14), paymentTypeCode: "VC", label: "03" });

// 4) INITIAL DEBIT -- hace 2 días, ubicación B
await approvedCycle({ location: locationB, operationType: "INITIAL", minutes: 10, plate: `PRUEB03${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}03`, at: daysAgo(2, 8), paymentTypeCode: "VD", label: "04" });

// 5) INITIAL CREDIT -- hace 2 días, ubicación A
await approvedCycle({ location: locationA, operationType: "INITIAL", minutes: 60, plate: `PRUEB04${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}04`, at: daysAgo(2, 16), paymentTypeCode: "SI", label: "05" });

// 6) INITIAL DEBIT -- hace 3 días, ubicación B (queda con sesión activa para extender en #7)
const p6 = await approvedCycle({ location: locationB, operationType: "INITIAL", minutes: 30, plate: `PRUEB05${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}05`, at: daysAgo(3, 11), paymentTypeCode: "VD", label: "06" });
// 7) EXTENSION CREDIT sobre la sesión de #6
await approvedCycle({ location: locationB, operationType: "EXTENSION", targetSessionId: p6.sessionId, minutes: 33, plate: `PRUEB05${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}05`, at: daysAgo(3, 15), paymentTypeCode: "S2", label: "07" });

// 8) INITIAL CREDIT -- hace 4 días, ubicación A
await approvedCycle({ location: locationA, operationType: "INITIAL", minutes: 25, plate: `PRUEB06${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}06`, at: daysAgo(4, 12), paymentTypeCode: "NC", label: "08" });

// 9) INITIAL rechazado -- hace 5 días, ubicación B
await rejectedCycle({ location: locationB, minutes: 40, plate: `PRUEB07${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}07`, at: daysAgo(5, 13), label: "09" });

// 10) INITIAL rechazado -- hace 6 días, ubicación A
await rejectedCycle({ location: locationA, minutes: 17, plate: `PRUEB08${suffix.slice(0, 1)}`.slice(0, 8), phone: `+569${suffix}08`, at: daysAgo(6, 17), label: "10" });

assert.equal(created.length, 10, "Debían quedar exactamente 10 payment_transactions creadas");
const committed = created.filter((c) => c.status === "COMMITTED");
const rejected = created.filter((c) => c.status === "REJECTED");
console.log(`\n[SEED] Listo: ${created.length} pagos de prueba insertados (${committed.length} COMMITTED, ${rejected.length} REJECTED).`);
console.log("[SEED] IDs de transacción (por si se necesita limpiar manualmente más adelante):");
for (const c of created) console.log(`  - #${c.label} ${c.status} ${c.transactionId}`);
