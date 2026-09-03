/******************************************************************
 * Set QA mínimo de patentes de prueba para validar Inspector desde
 * Android (2026-09-02).
 *
 * Mismo camino 100% real que un pago aprobado por Webpay (intent ->
 * transacción -> claim -> finalize vía finalize_authorized_on_street_payment)
 * que scripts/local-inspector-create-demo-batch.mjs y los demás scripts
 * *-demo-*.mjs -- reutiliza el mismo patrón, NO se inventa estructura ni se
 * llama a Transbank/SMS/register_on_street_inspection. Nunca se hace
 * backdate de expires_at: las patentes "vencidas" quedan vencidas por el
 * simple paso del tiempo real (mínimo permitido: 1 minuto), igual que
 * local-inspector-create-demo-vencido-sms-session.mjs.
 *
 * Idempotente por plate: antes de crear, verifica si YA existe una sesión
 * en el estado buscado (ACTIVE para QA0001; EXPIRED sin fiscalizar para
 * QA0002/QA0004) y si existe, no crea una nueva -- evita acumular filas de
 * más en reruns.
 *
 * QA0003 (SIN_SESION) y QA0005 (OBSERVADO) NO generan ninguna escritura --
 * ver comentarios inline sobre por qué.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-inspector-create-qa-set.mjs
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

// --- Fixture real: mismo Estacionamiento ON_STREET local con tarifa activa
// que el resto de scripts *-demo-*.mjs de este repo. ---
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
    location_snapshot: {}, rate_snapshot: {}, idempotency_key: `qa-set-${randomUUID()}`, status: "PENDING_PAYMENT",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("id,public_token,created_at").single());

  const buyOrder = `PFQASET${randomUUID().replace(/-/g, "").slice(0, 9)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const idem = `qa-set-${randomUUID()}`;

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

  return fail(await db.from("on_street_pilot_sessions").select("id,license_plate_normalized,phone_normalized,status,started_at,expires_at,purchased_minutes").eq("id", finalizeResult.data.sessionId).single());
}

async function sesionActivaExistente(plate) {
  const rows = fail(await db.from("on_street_pilot_sessions").select("id,status,expires_at").eq("license_plate_normalized", plate).eq("status", "ACTIVE").gt("expires_at", new Date().toISOString()).limit(1));
  return rows?.[0] || null;
}

async function sesionVencidaSinFiscalizarExistente(plate) {
  // "Vencida sin fiscalizar" = igual criterio que resolveOnStreetPlateState
  // (inspectorPlateStateCore.mjs): expires_at ya pasó y NO existe una
  // fiscalización (on_street_inspections) para esa sesión.
  const rows = fail(await db.from("on_street_pilot_sessions").select("id,status,expires_at").eq("license_plate_normalized", plate).lt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1));
  const candidate = rows?.[0];
  if (!candidate) return null;
  const inspections = fail(await db.from("on_street_inspections").select("id").eq("session_id", candidate.id).limit(1));
  return inspections?.length ? null : candidate;
}

// Teléfono para QA0001 (corrección 2026-09-03, "remove real phone from qa
// script"): NUNCA hardcodear un número real de una persona en un archivo
// versionado -- este repositorio es público en GitHub. Se lee de la
// variable de entorno LOCAL opcional INSPECTOR_QA_PHONE (para quien quiera
// probar un envío de verdad hacia su propio teléfono, seteándola en su
// propio shell o .env.local -- NUNCA versionada) y, si no está definida,
// cae a un número QA claramente ficticio (mismo patrón sintético
// "+569000000XX" ya usado abajo para QA0002/QA0004). Restricción real
// descubierta al ejecutar este script (índice único
// "on_street_one_active_phone_location_idx"): solo puede existir UNA sesión
// con status=ACTIVE por (ubicación, teléfono) al mismo tiempo -- el status
// no se voltea a EXPIRED solo por el paso del tiempo, sino cuando el
// repositorio la lee y la expira. Como QA0001 queda ACTIVE (VIGENTE, 30
// min) y no se re-lee aquí para forzar su expiración, QA0002/QA0004 no
// pueden reutilizar el mismo teléfono+ubicación mientras QA0001 siga
// activa -- por eso usan sus propios números QA sintéticos, distintos del
// de QA0001. Para una prueba real de SMS hacia un teléfono propio sobre una
// patente VENCIDA (no VIGENTE), ya existe
// scripts/local-inspector-create-demo-vencido-sms-session.mjs (patente
// DEMOSMS1) como vía dedicada -- ojo: ese script SÍ tiene un teléfono real
// hardcodeado. Fuera del alcance de esta corrección (es uno de los
// archivos locales preexistentes, no versionado en ningún commit
// pendiente, así que no viaja en este push), pero convendría aplicarle el
// mismo tratamiento en una tarea aparte si algún día se decide versionarlo.
const QA_PHONE_QA0001 = process.env.INSPECTOR_QA_PHONE || "+56900000001";

const plan = [
  { plate: "QA0001", phone: QA_PHONE_QA0001, minutes: 30, kind: "vigente", label: "QA0001 (VIGENTE, 30 min)" },
  { plate: "QA0002", phone: "+56900000002", minutes: 1, kind: "vencida", label: "QA0002 (VENCIDA, verificar expiración)" },
  { plate: "QA0004", phone: "+56900000004", minutes: 1, kind: "vencida", label: "QA0004 (VENCIDA, apta para fiscalización)" },
];

console.log(`[QA-SET] Ahora mismo: ${new Date().toISOString()}\n`);

for (const item of plan) {
  const existing = item.kind === "vigente" ? await sesionActivaExistente(item.plate) : await sesionVencidaSinFiscalizarExistente(item.plate);
  if (existing) {
    console.log(`[QA-SET] ${item.label}: ya existe sesión ${existing.id} (${existing.status}, expira ${existing.expires_at}) -- no se crea otra (idempotente).`);
    continue;
  }
  const session = await crearSesion(item);
  console.log(`[QA-SET] ${item.label}: sesión creada ${session.id} -- expira ${session.expires_at}, ${session.purchased_minutes} min.`);
}

console.log("\n[QA-SET] QA0003 -- SIN_SESION: no requiere ninguna escritura (sin filas para esa patente, Inspector debe mostrar 'sin sesión' directamente).");
console.log("[QA-SET] QA0005 -- OMITIDA. El único estado real equivalente a 'moroso/warning' en el esquema actual es OBSERVADO (ver src/lib/inspector/inspectorPlateStateCore.mjs), que exige un antecedente de fiscalización YA registrado como precondición -- crearlo aquí implicaría registrar una fiscalización, lo cual esta tarea pide explícitamente NO hacer todavía.");
console.log("\n[QA-SET] Las patentes VENCIDA quedan vencidas por el simple paso del tiempo real (~1 minuto desde su creación), sin editar expires_at a mano. Espera ~1 minuto antes de validar QA0002/QA0004 como VENCIDAS.");
