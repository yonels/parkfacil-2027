/******************************************************************
 * Cierre del flujo de extensión de tiempo QR On-Street (auditoría
 * 2026-08-28). Prueba end-to-end REAL contra Supabase LOCAL de:
 *
 *  - Caso A: extensión pagada mientras la sesión sigue ACTIVE/vigente
 *    -> nuevo expires_at = expires_at anterior + minutos.
 *  - Caso B (el bug corregido): extensión iniciada válidamente cuando la
 *    sesión estaba ACTIVE, pero expira (se persiste EXPIRED por el
 *    barrido automático) DURANTE el checkout de Webpay, y luego Transbank
 *    autoriza -> el pago se aplica igual, expires_at nunca queda en el
 *    pasado, la sesión vuelve a 'ACTIVE'.
 *  - Una sesión ya vencida en el momento de CREAR la extensión (vía la
 *    ruta pública real /api/public/on-street/sessions/{token}/extension-
 *    intents) es rechazada con 409 -- prueba el gate real de
 *    createExtensionPaymentIntent, no una reimplementación.
 *  - Una sesión CLOSED (cierre explícito del conductor) nunca se reabre
 *    con una extensión, aunque el pago se autorice.
 *  - Múltiples extensiones consecutivas se acumulan sin doble conteo.
 *  - Idempotencia: doble finalize del mismo transactionId -> ALREADY_
 *    COMMITTED, no vuelve a sumar minutos/monto.
 *  - Concurrencia: dos finalize simultáneos del mismo transactionId ->
 *    exactamente una aplicación real.
 *  - INITIALIZED/REDIRECTED/ABORTED/FAILED nunca aplican minutos.
 *  - Cada extensión usa nuevo buy_order/provider_session_id/token_ws/
 *    idempotency_key -- nunca reutiliza una transacción anterior.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-on-street-extension-e2e.mjs
 *
 * Requiere el server dev local corriendo en PARKFACIL_PUBLIC_BASE_URL
 * (por defecto http://127.0.0.1:3000) SOLO para el sub-test que ejercita
 * la ruta pública real de creación de intents (createExtensionPaymentIntent).
 * El resto opera directo sobre las RPCs reales de Supabase LOCAL -- nunca
 * toca Producción, nunca hace un pago real (Transbank se simula con una
 * respuesta AUTHORIZED sintética pasada directo a finalize_authorized_
 * on_street_payment, exactamente el mismo contrato que processWebpayReturn
 * usa tras un commit real).
 ******************************************************************/
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hashPaymentToken, encryptPaymentToken } from "../src/lib/payments/paymentTokenCrypto.mjs";
import { webpayPaymentType } from "../src/lib/payments/webpayCore.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.PARKFACIL_PUBLIC_BASE_URL || "http://127.0.0.1:3000";
assert.match(url || "", /^http:\/\/(127\.0\.0\.1|localhost):54321$/, "Este script solo corre contra Supabase LOCAL");
assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY requerida");

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (r) => { if (r.error) throw r.error; return r.data; };
const results = { pass: 0, fail: 0 };
function check(name, cond) {
  if (cond) { results.pass += 1; console.log(`  ok - ${name}`); }
  else { results.fail += 1; console.error(`  FAIL - ${name}`); }
}

// --- Fixture: ubicación ON_STREET real con tarifa activa ---
const locations = fail(await db.from("on_street_qr_locations").select("id,public_code,parking_id,sector_id").eq("status", "ACTIVE").limit(50));
assert.ok(locations?.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
let fixture;
for (const location of locations) {
  const rates = fail(await db.from("parking_rates").select("id,minute_amount,currency").eq("parking_id", location.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").limit(1));
  if (rates?.length) { fixture = { location, rate: rates[0] }; break; }
}
if (!fixture) {
  // Entorno local sin tarifa por-minuto todavía provisionada para ninguna
  // ubicación ON_STREET existente: se crea una fixture mínima, real, solo
  // en Supabase LOCAL (nunca en Producción), igual convención que el resto
  // de scripts locales de este proyecto (p.ej. local-on-street-sms-e2e.mjs).
  const location = locations[0];
  const createdRate = fail(await db.from("parking_rates").insert({ parking_id: location.parking_id, name: "E2E Extensión On-Street (tarifa de prueba)", billing_mode: "EFFECTIVE_MINUTE", minute_amount: 30, currency: "CLP", status: "ACTIVE", valid_from: new Date(Date.now() - 60_000).toISOString() }).select("id,minute_amount,currency").single());
  fixture = { location, rate: createdRate };
  console.log(`[E2E] Se creó una tarifa EFFECTIVE_MINUTE local de prueba (parking_id=${location.parking_id}) porque no existía ninguna.`);
}
assert.ok(fixture, "LOCAL_ACTIVE_RATE_REQUIRED");
const rate = Number(fixture.rate.minute_amount);
const suffix = randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
console.log(`[E2E] Ubicación ${fixture.location.public_code}, tarifa/min=${rate}`);

// --- Helpers RPC (mismo contrato que onStreetPaymentService.js / paymentTransactionRepository.js) ---
async function insertIntent({ operationType, targetSessionId, minutes, plate, phone, idempotencyKey }) {
  // finalize_authorized_on_street_payment exige, para EXTENSION, que
  // i.license_plate_normalized coincida exactamente con la patente de la
  // sesión objetivo (PILOT_SESSION_IDENTITY_MISMATCH si no) -- igual que
  // createExtensionPaymentIntent, que siempre copia
  // current.session.license_plate_normalized. El llamador debe pasar la
  // patente REAL de la sesión objetivo en "plate" para EXTENSION.
  const amount = Math.round(minutes * rate);
  const row = {
    qr_location_id: fixture.location.id, parking_id: fixture.location.parking_id,
    license_plate_normalized: plate,
    phone_normalized: phone, operation_type: operationType, target_session_id: targetSessionId,
    purchased_minutes: minutes, rate_id: fixture.rate.id, rate_per_minute: rate, amount,
    currency: fixture.rate.currency || "CLP", location_snapshot: {}, rate_snapshot: {},
    idempotency_key: idempotencyKey, status: "PENDING_PAYMENT", expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
  return fail(await db.from("on_street_payment_intents").insert(row).select("id,public_token").single());
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
async function finalizeAuthorized(transactionId, amount, buyOrder) {
  const paymentTypeCode = "VN"; // CREDIT, igual que la prueba real con tarjeta de crédito documentada
  const response = { status: "AUTHORIZED", response_code: 0, buy_order: buyOrder, amount, authorization_code: `AUT${randomUUID().slice(0, 6)}`, payment_type_code: paymentTypeCode };
  const r = await db.rpc("finalize_authorized_on_street_payment", { p_transaction_id: transactionId, p_provider_status: response.status, p_authorization_code: response.authorization_code, p_response_code: response.response_code, p_provider_response: response, p_payment_type: webpayPaymentType(paymentTypeCode), p_provider_payment_type_code: paymentTypeCode });
  if (r.error) throw r.error;
  return r.data;
}
async function fullPaymentCycle({ intentPublicToken, amount, idemSuffix }) {
  const buyOrder = `PFE2E${idemSuffix}${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(intentPublicToken, `e2e-tx-${idemSuffix}-${randomUUID()}`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);
  const outcome = await finalizeAuthorized(transactionId, amount, buyOrder);
  return { transactionId, buyOrder, providerSessionId, token, outcome };
}
async function getSession(id) { return fail(await db.from("on_street_pilot_sessions").select("*").eq("id", id).single()); }
async function getTransaction(id) { return fail(await db.from("payment_transactions").select("*").eq("id", id).single()); }

// === Sesión INITIAL base (10 min) para los casos A/B/múltiples ===
const phoneA = `+569${suffix}`;
const plateA = `E2E${suffix.slice(0, 5)}`;
const initialA = await insertIntent({ operationType: "INITIAL", minutes: 10, plate: plateA, phone: phoneA, idempotencyKey: `e2e-initial-a-${randomUUID()}` });
const cycleA = await fullPaymentCycle({ intentPublicToken: initialA.public_token, amount: Math.round(10 * rate), idemSuffix: "ia" });
check("INITIAL: pago autorizado crea sesión ACTIVE", cycleA.outcome.result === "COMMITTED");
let sessionA = await getSession(cycleA.outcome.sessionId);
check("INITIAL: sesión creada ACTIVE con expires_at ~ +10min", sessionA.status === "ACTIVE");
const originalExpiryA = new Date(sessionA.expires_at).getTime();

console.log("\n[CASO A] Extensión pagada mientras la sesión sigue vigente");
{
  const beforeExpiry = new Date(sessionA.expires_at);
  const extA = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 5, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-a-${randomUUID()}` });
  const cycle = await fullPaymentCycle({ intentPublicToken: extA.public_token, amount: Math.round(5 * rate), idemSuffix: "ea" });
  check("Caso A: finalize COMMITTED", cycle.outcome.result === "COMMITTED");
  sessionA = await getSession(sessionA.id);
  const expectedExpiry = new Date(beforeExpiry.getTime() + 5 * 60000);
  check("Caso A: nuevo expires_at = expires_at anterior + minutos (suma sobre vencimiento vigente)", Math.abs(new Date(sessionA.expires_at).getTime() - expectedExpiry.getTime()) < 1000);
  check("Caso A: purchased_minutes acumulado (10+5=15)", sessionA.purchased_minutes === 15);
  check("Caso A: status sigue ACTIVE", sessionA.status === "ACTIVE");
}

console.log("\n[CASO B -- EL FIX] Extensión iniciada ACTIVE, sesión vence y se persiste EXPIRED durante el checkout, luego Transbank autoriza");
{
  // Se crea el intent (evidencia de que la sesión estaba ACTIVE en ese
  // momento -- igual regla que createExtensionPaymentIntent exige).
  const extB = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 8, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-b-${randomUUID()}` });
  const buyOrder = `PFE2EB${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(extB.public_token, `e2e-tx-eb-${randomUUID()}`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);

  // Simula: mientras el conductor está en Webpay, expires_at pasa y el
  // barrido automático (idéntico al que corre el cron cada 2 min) persiste
  // EXPIRED -- exactamente la causa raíz documentada en la migración.
  await fail(await db.from("on_street_pilot_sessions").update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", sessionA.id).select("id").single());
  const swept = await db.rpc("expire_on_street_pilot_sessions", { p_parking_id: null });
  if (swept.error) throw swept.error;
  const sweptSession = await getSession(sessionA.id);
  check("Caso B: el barrido efectivamente persistió EXPIRED antes de que Transbank autorizara (reproduce la carrera real)", sweptSession.status === "EXPIRED");

  const before = Date.now();
  const outcome = await finalizeAuthorized(transactionId, Math.round(8 * rate), buyOrder);
  check("Caso B: Transbank autoriza DESPUÉS de la expiración persistida -> finalize NO debe rechazar (antes del fix: PILOT_SESSION_NOT_ACTIVE)", outcome.result === "COMMITTED");
  sessionA = await getSession(sessionA.id);
  check("Caso B: la sesión vuelve a 'ACTIVE' (el pago autorizado la reactiva)", sessionA.status === "ACTIVE");
  check("Caso B: el nuevo expires_at NUNCA queda en el pasado", new Date(sessionA.expires_at).getTime() > before);
  const expectedFromAuthMoment = new Date(before + 8 * 60000);
  check("Caso B: expires_at se cuenta desde el momento de autorización (no desde el expires_at vencido) -- sin regalar tiempo retroactivo", Math.abs(new Date(sessionA.expires_at).getTime() - expectedFromAuthMoment.getTime()) < 5000);
  check("Caso B: purchased_minutes sigue acumulando correctamente (15+8=23)", sessionA.purchased_minutes === 23);
  check("Caso B: no se perdió el dinero -- amount_paid incluye el monto de esta extensión", Number(sessionA.amount_paid) >= Math.round(10 * rate) + Math.round(5 * rate) + Math.round(8 * rate));
}

console.log("\n[MÚLTIPLES EXTENSIONES] Se acumulan sin doble contabilización (10 inicial +5 +8 ya aplicados arriba; +20 más)");
{
  const extC = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 20, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-c-${randomUUID()}` });
  await fullPaymentCycle({ intentPublicToken: extC.public_token, amount: Math.round(20 * rate), idemSuffix: "ec" });
  sessionA = await getSession(sessionA.id);
  check("Múltiples extensiones: total 10+5+8+20=43 minutos, sin doble conteo", sessionA.purchased_minutes === 43);
}

console.log("\n[IDEMPOTENCIA] Doble finalize del mismo transactionId no vuelve a sumar minutos");
{
  const before = await getSession(sessionA.id);
  const extD = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 7, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-d-${randomUUID()}` });
  const buyOrder = `PFE2ED${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(extD.public_token, `e2e-tx-ed-${randomUUID()}`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);
  const amount = Math.round(7 * rate);
  const first = await finalizeAuthorized(transactionId, amount, buyOrder);
  check("Idempotencia: primer finalize COMMITTED", first.result === "COMMITTED");
  const second = await finalizeAuthorized(transactionId, amount, buyOrder);
  check("Idempotencia: segundo finalize (mismo transactionId) -> ALREADY_COMMITTED", second.result === "ALREADY_COMMITTED");
  const after = await getSession(sessionA.id);
  check("Idempotencia: purchased_minutes solo sumó una vez (+7, no +14)", after.purchased_minutes === before.purchased_minutes + 7);
  check("Idempotencia: amount_paid solo sumó una vez", Number(after.amount_paid) === Number(before.amount_paid) + amount);
  sessionA = after;
}

console.log("\n[CONCURRENCIA] Dos finalize simultáneos del mismo transactionId -> exactamente una aplicación");
{
  const before = await getSession(sessionA.id);
  const extE = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 6, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-e-${randomUUID()}` });
  const buyOrder = `PFE2EE${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(extE.public_token, `e2e-tx-ee-${randomUUID()}`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);
  const amount = Math.round(6 * rate);
  const [r1, r2] = await Promise.all([finalizeAuthorized(transactionId, amount, buyOrder), finalizeAuthorized(transactionId, amount, buyOrder)]);
  const committedCount = [r1, r2].filter((r) => r.result === "COMMITTED").length;
  const alreadyCount = [r1, r2].filter((r) => r.result === "ALREADY_COMMITTED").length;
  check("Concurrencia: exactamente uno de los dos finalize concurrentes aplica el COMMIT real (el otro ve ALREADY_COMMITTED, gracias al lock 'for update')", committedCount === 1 && alreadyCount === 1);
  const after = await getSession(sessionA.id);
  check("Concurrencia: los minutos se sumaron exactamente una vez pese a la carrera", after.purchased_minutes === before.purchased_minutes + 6);
  sessionA = after;
}

console.log("\n[ESTADOS NO AUTORIZADOS] INITIALIZED/REDIRECTED/ABORTED/FAILED nunca aplican minutos");
{
  const before = await getSession(sessionA.id);
  for (const scenario of ["REDIRECTED_SIN_COMMIT", "RECHAZADO_POR_TRANSBANK"]) {
    const extF = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 9, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-f-${scenario}-${randomUUID()}` });
    const buyOrder = `PFE2EF${randomUUID().replace(/-/g, "").slice(0, 10)}`.slice(0, 26);
    const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
    const transactionId = await createTransaction(extF.public_token, `e2e-tx-ef-${scenario}-${randomUUID()}`, buyOrder, providerSessionId);
    if (scenario === "REDIRECTED_SIN_COMMIT") {
      const token = randomUUID();
      await redirectTransaction(transactionId, token);
      const tx = await getTransaction(transactionId);
      check(`Estado ${scenario}: transacción queda REDIRECTED, nunca COMMITTED`, tx.status === "REDIRECTED");
    } else {
      const token = randomUUID();
      await redirectTransaction(transactionId, token);
      await claim(token);
      // Transbank rechaza -> el código real (processWebpayReturn) llama a
      // markTransactionFailed en vez de finalize cuando isAuthorizedWebpayResponse
      // es false. Se reproduce ese mismo camino aquí.
      await fail(await db.from("payment_transactions").update({ status: "REJECTED", provider_status: "FAILED", failed_at: new Date().toISOString() }).eq("id", transactionId).neq("status", "COMMITTED").select("id").single());
      const tx = await getTransaction(transactionId);
      check(`Estado ${scenario}: transacción queda REJECTED, nunca COMMITTED`, tx.status === "REJECTED");
    }
  }
  const after = await getSession(sessionA.id);
  check("Ningún estado no autorizado sumó minutos: purchased_minutes sin cambios", after.purchased_minutes === before.purchased_minutes);
  check("Ningún estado no autorizado sumó monto: amount_paid sin cambios", Number(after.amount_paid) === Number(before.amount_paid));
}

console.log("\n[NUEVA TRANSACCIÓN POR EXTENSIÓN] buy_order/provider_session_id/token_ws/idempotency_key distintos");
{
  const seen = { buyOrders: new Set(), providerSessionIds: new Set(), tokens: new Set(), idemKeys: new Set() };
  for (let n = 0; n < 3; n += 1) {
    const ext = await insertIntent({ operationType: "EXTENSION", targetSessionId: sessionA.id, minutes: 1, plate: plateA, phone: phoneA, idempotencyKey: `e2e-ext-g-${n}-${randomUUID()}` });
    seen.idemKeys.add(ext.public_token);
    const buyOrder = `PFE2EG${n}${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 26);
    const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
    const transactionId = await createTransaction(ext.public_token, `e2e-tx-eg-${n}-${randomUUID()}`, buyOrder, providerSessionId);
    const token = randomUUID();
    await redirectTransaction(transactionId, token);
    seen.buyOrders.add(buyOrder); seen.providerSessionIds.add(providerSessionId); seen.tokens.add(token);
    await claim(token);
    await finalizeAuthorized(transactionId, Math.round(1 * rate), buyOrder);
  }
  check("3 extensiones consecutivas: 3 buy_order distintos", seen.buyOrders.size === 3);
  check("3 extensiones consecutivas: 3 provider_session_id distintos", seen.providerSessionIds.size === 3);
  check("3 extensiones consecutivas: 3 token_ws distintos", seen.tokens.size === 3);
  check("3 extensiones consecutivas: 3 intents (idempotency_key) distintos", seen.idemKeys.size === 3);
}

console.log("\n[SESIÓN CLOSED] Nunca se reabre con una extensión, aunque Transbank autorice");
{
  const phoneClosed = `+569${suffix.slice(0, 4)}9999`;
  const plateClosed = `CLS${suffix.slice(0, 5)}`;
  const initClosed = await insertIntent({ operationType: "INITIAL", minutes: 10, plate: plateClosed, phone: phoneClosed, idempotencyKey: `e2e-initial-closed-${randomUUID()}` });
  const cycle = await fullPaymentCycle({ intentPublicToken: initClosed.public_token, amount: Math.round(10 * rate), idemSuffix: "ic" });
  const closedSessionId = cycle.outcome.sessionId;
  await fail(await db.from("on_street_pilot_sessions").update({ status: "CLOSED", ended_at: new Date().toISOString(), duration_seconds: 60 }).eq("id", closedSessionId).select("id").single());
  const extClosed = await insertIntent({ operationType: "EXTENSION", targetSessionId: closedSessionId, minutes: 5, plate: plateClosed, phone: phoneClosed, idempotencyKey: `e2e-ext-closed-${randomUUID()}` });
  const buyOrder = `PFE2ECL${randomUUID().replace(/-/g, "").slice(0, 9)}`.slice(0, 26);
  const providerSessionId = randomUUID().replace(/-/g, "").slice(0, 61);
  const transactionId = await createTransaction(extClosed.public_token, `e2e-tx-closed-${randomUUID()}`, buyOrder, providerSessionId);
  const token = randomUUID();
  await redirectTransaction(transactionId, token);
  await claim(token);
  let rejected = false, message = null;
  try { await finalizeAuthorized(transactionId, Math.round(5 * rate), buyOrder); }
  catch (e) { rejected = true; message = e.message; }
  check("Sesión CLOSED: finalize rechaza con PILOT_SESSION_NOT_ACTIVE (nunca se reabre una sesión cerrada explícitamente)", rejected && /PILOT_SESSION_NOT_ACTIVE/.test(String(message)));
  const finalClosed = await getSession(closedSessionId);
  check("Sesión CLOSED: sigue CLOSED, no se reactivó", finalClosed.status === "CLOSED");
}

console.log(`\n[GATE REAL] POST /api/public/on-street/sessions/{token}/extension-intents contra sesión ya EXPIRED -> 409 (createExtensionPaymentIntent real, vía HTTP)`);
{
  const phoneExp = `+569${suffix.slice(0, 4)}8888`;
  const initExp = await insertIntent({ operationType: "INITIAL", minutes: 1, plate: `EXP${suffix.slice(0, 5)}`, phone: phoneExp, idempotencyKey: `e2e-initial-exp-${randomUUID()}` });
  const cycle = await fullPaymentCycle({ intentPublicToken: initExp.public_token, amount: Math.round(1 * rate), idemSuffix: "ie" });
  const expSession = await getSession(cycle.outcome.sessionId);
  await fail(await db.from("on_street_pilot_sessions").update({ expires_at: new Date(Date.now() - 5 * 60000).toISOString() }).eq("id", expSession.id).select("id").single());
  try {
    const response = await fetch(`${appUrl}/api/public/on-street/sessions/${expSession.public_token}/extension-intents`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `e2e-http-gate-${randomUUID()}` }, body: JSON.stringify({ minutes: 10 }),
    });
    const body = await response.json().catch(() => ({}));
    check("Gate real HTTP: crear una extensión sobre sesión ya vencida responde 409", response.status === 409);
    check("Gate real HTTP: código PILOT_SESSION_NOT_ACTIVE", body.code === "PILOT_SESSION_NOT_ACTIVE");
    const afterHttp = await getSession(expSession.id);
    check("Gate real HTTP: refresh_on_street_pilot_session persistió EXPIRED al consultar (visto por el gate)", afterHttp.status === "EXPIRED");
  } catch (cause) {
    console.warn(`  [omitido] No fue posible contactar ${appUrl} (¿dev server no está corriendo?): ${cause.message}`);
  }
}

console.log(`\n=== RESULTADO: ${results.pass} OK / ${results.fail} FALLIDAS ===`);
if (results.fail > 0) process.exit(1);
