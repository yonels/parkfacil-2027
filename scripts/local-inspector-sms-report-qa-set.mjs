/******************************************************************
 * Set QA para el Reporte SMS Inspector (2026-09-03): 6 fiscalizaciones OVERSTAY
 * ya registradas (patrón real: sesión vencida + register_on_street_inspection
 * vía la misma RPC de siempre), cada una ajustada DESPUÉS a un estado
 * sms_status/sms_delivery_status/inspector_copy_sms_status distinto para
 * poder ver las 7 filas de estado (envío + DLR + copia) sin depender de que
 * el proveedor real produzca cada combinación a demanda.
 *
 * NUNCA usa SMS_PROVIDER=sentraland ni llama a sentralandCore -- fuerza
 * SIMULATED para el envío inicial (real, pero simulado: nunca contacta un
 * proveedor real) y luego hace un UPDATE directo de las columnas de estado
 * para los casos que SIMULATED no puede producir por sí solo (UNDELIV,
 * EXPIRED, FAILED, etc.) -- documentado en cada caso.
 *
 * NUNCA usa teléfonos reales -- mismo patrón sintético "+569000000XX" ya
 * establecido en el resto de scripts QA de este repo.
 *
 * Uso:
 *   SMS_PROVIDER=simulated node --env-file=.env.local scripts/local-inspector-sms-report-qa-set.mjs
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
assert.notEqual(process.env.SMS_PROVIDER, "sentraland", "Este script NUNCA debe correr con SMS_PROVIDER=sentraland -- fuerza SIMULATED o déjalo sin definir");
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const fail = (r) => { if (r.error) throw r.error; return r.data; };

const locations = fail(await db.from("on_street_qr_locations").select("id,parking_id").eq("status", "ACTIVE").limit(1));
assert.ok(locations?.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
const location = locations[0];
const rates = fail(await db.from("parking_rates").select("id,minute_amount").eq("parking_id", location.parking_id).eq("billing_mode", "EFFECTIVE_MINUTE").eq("status", "ACTIVE").limit(1));
assert.ok(rates?.length, "LOCAL_ACTIVE_RATE_REQUIRED");
const rate = Number(rates[0].minute_amount);

async function crearSesionVencida(plate, phone) {
  const amount = Math.round(1 * rate);
  const intent = fail(await db.from("on_street_payment_intents").insert({
    qr_location_id: location.id, parking_id: location.parking_id,
    license_plate_normalized: plate, phone_normalized: phone,
    operation_type: "INITIAL", target_session_id: null,
    purchased_minutes: 1, rate_id: rates[0].id, rate_per_minute: rate, amount, currency: "CLP",
    location_snapshot: {}, rate_snapshot: {}, idempotency_key: `qa-sms-report-${randomUUID()}`, status: "PENDING_PAYMENT",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("id,public_token").single());
  const buyOrder = `PFQASMSR${randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 26);
  const tx = await db.rpc("create_on_street_payment_transaction", { p_intent_token: intent.public_token, p_idempotency_key: `qa-sms-report-${randomUUID()}-tx`, p_buy_order: buyOrder, p_provider_session_id: randomUUID().replace(/-/g, "").slice(0, 61) });
  if (tx.error) throw tx.error;
  const token = randomUUID();
  fail(await db.from("payment_transactions").update({ status: "REDIRECTED", token_ws_hash: hashPaymentToken(token), token_ws_encrypted: encryptPaymentToken(token), gateway_url: "https://webpay3gint.transbank.cl/simulate", redirected_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", tx.data.transactionId).eq("status", "CREATED").select("id").single());
  const claim = await db.rpc("claim_on_street_webpay_commit", { p_token_hash: hashPaymentToken(token) });
  if (claim.error) throw claim.error;
  const response = { status: "AUTHORIZED", response_code: 0, buy_order: buyOrder, amount, authorization_code: `AUT${randomUUID().slice(0, 6).toUpperCase()}`, payment_type_code: "VD" };
  const finalize = await db.rpc("finalize_authorized_on_street_payment", { p_transaction_id: tx.data.transactionId, p_provider_status: response.status, p_authorization_code: response.authorization_code, p_response_code: response.response_code, p_provider_response: response, p_payment_type: webpayPaymentType("VD"), p_provider_payment_type_code: "VD" });
  if (finalize.error) throw finalize.error;
  assert.equal(finalize.data.result, "COMMITTED");
  return finalize.data.sessionId;
}

async function fiscalizarOverstay(plate, sessionId, phone, inspectorUserId) {
  // p_phone_normalized: la RPC lo inserta TAL CUAL en on_street_inspections.
  // phone_normalized (confirmado leyendo la migración 20260827200000_on_
  // street_inspections.sql -- NO lo deriva de la sesión) -- corrección
  // 2026-09-03: una primera versión de este script pasaba null aquí
  // asumiendo lo contrario, lo que dejaba phone_normalized vacío en las 6
  // filas QA. registerOnStreetInspection (la capa JS real) SÍ pasa
  // session.phone_normalized explícitamente por esta misma razón -- este
  // script hace lo mismo ahora.
  const result = await db.rpc("register_on_street_inspection", {
    p_idempotency_key: `qa-sms-report-${randomUUID()}`,
    p_license_plate: plate, p_session_id: sessionId,
    p_qr_location_id: location.id, p_parking_id: location.parking_id,
    p_inspector_user_id: inspectorUserId,
    p_inspection_type: "OVERSTAY", p_vehicle_still_present: true,
    p_observations: "QA Reporte SMS Inspector", p_latitude: null, p_longitude: null,
    p_phone_normalized: phone,
  });
  if (result.error) throw result.error;
  return result.data.id;
}

// Inspector QA: reutiliza el usuario de prueba ya establecido en este repo
// (scripts/local-inspector-create-test-user.mjs) -- si no existe, se
// informa en vez de crear un usuario nuevo aquí (fuera del alcance de este
// script).
const inspectorEmail = "inspector.prueba@parkfacil.cl";
let inspectorUserId = null;
for (let page = 1; page <= 5 && !inspectorUserId; page += 1) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  const found = data.users.find((u) => u.email?.toLowerCase() === inspectorEmail.toLowerCase());
  if (found) inspectorUserId = found.id;
  if (data.users.length < 200) break;
}
assert.ok(inspectorUserId, `Falta el usuario de prueba ${inspectorEmail} -- corre primero scripts/local-inspector-create-test-user.mjs`);

const plan = [
  { plate: "QASM001", phone: "+56900000801", caso: "SENT sin DLR todavía", smsStatus: "SENT", smsDeliveryStatus: null, copyStatus: "SENT" },
  { plate: "QASM002", phone: "+56900000802", caso: "SENT + DLR DELIVRD", smsStatus: "SENT", smsDeliveryStatus: "DELIVERED", smsDeliveryDescription: "DELIVRD", copyStatus: "SENT" },
  { plate: "QASM003", phone: "+56900000803", caso: "SENT + DLR UNDELIV", smsStatus: "SENT", smsDeliveryStatus: "UNDELIVERED", smsDeliveryDescription: "UNDELIV", copyStatus: "NOT_CONFIGURED" },
  { plate: "QASM004", phone: "+56900000804", caso: "SMS conductor FAILED (copia queda SKIPPED)", smsStatus: "FAILED", smsDeliveryStatus: null, copyStatus: "SKIPPED" },
  { plate: "QASM005", phone: "+56900000805", caso: "SENT + copia inspector SENT (caso normal completo)", smsStatus: "SENT", smsDeliveryStatus: "ACCEPTED", smsDeliveryDescription: "ENROUTE", copyStatus: "SENT" },
  { plate: "QASM006", phone: "+56900000806", caso: "SENT + copia inspector NOT_CONFIGURED", smsStatus: "SENT", smsDeliveryStatus: null, copyStatus: "NOT_CONFIGURED" },
];

console.log(`[QA-SMS-REPORT] Inspector QA: ${inspectorEmail} (${inspectorUserId})\n`);

for (const item of plan) {
  const existing = await db.from("on_street_inspections").select("id").eq("license_plate_normalized", item.plate).maybeSingle();
  if (existing.data) {
    console.log(`[QA-SMS-REPORT] ${item.plate} (${item.caso}): ya existe ${existing.data.id} -- no se crea otra (idempotente).`);
    continue;
  }
  const sessionId = await crearSesionVencida(item.plate, item.phone);
  const inspectionId = await fiscalizarOverstay(item.plate, sessionId, item.phone, inspectorUserId);

  // Ajuste QA directo de las columnas de estado: register_on_street_inspection
  // (la RPC llamada arriba) SOLO crea la fila con sms_status='PENDING' (deja
  // el envío real a sendInspectionSmsIfNeeded/sendInspectorCopySmsIfNeeded en
  // inspectorInspectionService.js, la capa JS -- este script llama a la RPC
  // directamente, sin pasar por esa capa, así que ningún SMS -- ni siquiera
  // simulado -- se intenta nunca aquí). Este UPDATE reemplaza ese
  // 'PENDING' por el estado exacto que cada caso QA necesita mostrar, sin
  // depender de que un envío real (simulado o no) produzca esa combinación
  // a demanda. Nunca se hace así en el flujo real de la app.
  const patch = { sms_status: item.smsStatus };
  if (item.smsStatus === "SENT") patch.sms_provider_message_id = `simulated-qa-${randomUUID().slice(0, 12)}`;
  if (item.smsDeliveryStatus !== undefined) {
    patch.sms_delivery_status = item.smsDeliveryStatus;
    patch.sms_delivery_checked_at = item.smsDeliveryStatus ? new Date().toISOString() : null;
    patch.sms_delivery_description = item.smsDeliveryDescription || null;
  }
  patch.inspector_copy_sms_status = item.copyStatus;
  if (item.copyStatus === "SENT") {
    patch.inspector_copy_sms_sent_at = new Date().toISOString();
    patch.inspector_copy_sms_provider_message_id = `simulated-qa-copy-${randomUUID().slice(0, 12)}`;
  }
  fail(await db.from("on_street_inspections").update(patch).eq("id", inspectionId).select("id").single());
  console.log(`[QA-SMS-REPORT] ${item.plate} (${item.caso}): fiscalización ${inspectionId} ajustada.`);
}

console.log("\n[QA-SMS-REPORT] Listo. Abre Inspector -> Reporte SMS (o consulta directamente /api/inspector/sms-report) para ver las 6 filas.");
