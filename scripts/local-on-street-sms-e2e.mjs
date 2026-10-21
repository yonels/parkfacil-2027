import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { processDueOnStreetSms } from "../src/lib/onStreetSmsCore.mjs";
import { isEligibleOnStreetSmsNotification } from "../src/lib/onStreetSmsEligibility.mjs";
import { simulatedSmsProvider } from "../src/lib/onStreetSmsProviderCore.mjs";

assert.equal(process.env.SMS_PROVIDER, "simulated", "SMS_PROVIDER_MUST_BE_SIMULATED");
assert.ok(process.env.CRON_SECRET, "CRON_SECRET_NOT_CONFIGURED");
assert.ok(process.env.PARKFACIL_PUBLIC_BASE_URL, "PARKFACIL_PUBLIC_BASE_URL_NOT_CONFIGURED");
assert.match(process.env.NEXT_PUBLIC_SUPABASE_URL || "", /^http:\/\/(127\.0\.0\.1|localhost):54321$/);
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "LOCAL_SERVICE_ROLE_KEY_NOT_CONFIGURED");
assert.match(process.env.LOCAL_SUPABASE_DB_URL || "", /^postgres(?:ql)?:\/\/(?:[^@]+@)?(127\.0\.0\.1|localhost):\d+\//);

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = { notifications: [], extensions: [], sessions: [], transactions: [], intents: [] };
const now = new Date();
const firstExpiry = new Date(now.getTime() + 15 * 60_000);
const secondExpiry = new Date(firstExpiry.getTime() + 30 * 60_000);
const thirdExpiry = new Date(secondExpiry.getTime() + 30 * 60_000);
const suffix = crypto.randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
const phone = `+569${suffix}`;
const licensePlate = `QR${suffix.slice(0, 4)}`;

async function one(table, query) {
  const result = await query;
  if (result.error) throw Object.assign(new Error(`${table}: ${result.error.message}`), { details: result.error.details });
  return result.data;
}

try {
  const locations = await one("on_street_qr_locations", db.from("on_street_qr_locations").select("id,parking_id,sector_id").eq("status", "ACTIVE").limit(20));
  assert.ok(locations.length, "LOCAL_ACTIVE_QR_LOCATION_REQUIRED");
  let fixture;
  for (const location of locations) {
    const rates = await one("parking_rates", db.from("parking_rates").select("id,minute_amount,currency").eq("parking_id", location.parking_id).eq("status", "ACTIVE").limit(1));
    if (rates.length) { fixture = { location, rate: rates[0] }; break; }
  }
  assert.ok(fixture, "LOCAL_ACTIVE_RATE_REQUIRED");
  const amount = Math.max(1, Math.round(Number(fixture.rate.minute_amount) * 15));
  const commonIntent = { qr_location_id: fixture.location.id, parking_id: fixture.location.parking_id, license_plate_normalized: licensePlate, phone_normalized: phone, purchased_minutes: 15, rate_id: fixture.rate.id, rate_per_minute: Number(fixture.rate.minute_amount), amount, currency: fixture.rate.currency || "CLP", location_snapshot: {}, rate_snapshot: {}, status: "PENDING_PAYMENT", expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(), paid_at: null };

  const initialIntent = await one("initial intent", db.from("on_street_payment_intents").insert({ ...commonIntent, operation_type: "INITIAL", idempotency_key: `sms-e2e-initial-${crypto.randomUUID()}` }).select("id").single());
  ids.intents.push(initialIntent.id);
  const initialTransaction = await one("initial transaction", db.from("payment_transactions").insert({ provider: "TRANSBANK_WEBPAY", source_type: "ON_STREET_INITIAL", source_id: initialIntent.id, amount, currency: "CLP", buy_order: `SMSE2EI${Date.now()}`.slice(0, 26), provider_session_id: crypto.randomUUID(), idempotency_key: `sms-e2e-tx-${crypto.randomUUID()}`, status: "COMMITTED", provider_status: "AUTHORIZED", response_code: 0, committed_at: now.toISOString() }).select("id").single());
  ids.transactions.push(initialTransaction.id);
  const session = await one("session", db.from("on_street_pilot_sessions").insert({ qr_location_id: fixture.location.id, parking_id: fixture.location.parking_id, license_plate_normalized: licensePlate, phone_normalized: phone, status: "ACTIVE", started_at: now.toISOString(), purchased_minutes: 15, rate_id: fixture.rate.id, rate_per_minute: Number(fixture.rate.minute_amount), simulated_amount: amount, amount_paid: amount, expires_at: firstExpiry.toISOString(), payment_transaction_id: initialTransaction.id, operational_number: `SMS-E2E-${crypto.randomUUID()}` }).select("id,public_token,license_plate_normalized,phone_normalized").single());
  ids.sessions.push(session.id);
  assert.equal(session.license_plate_normalized, licensePlate); assert.equal(session.phone_normalized, phone);
  await one("intent result", db.from("on_street_payment_intents").update({ status: "PAID", paid_at: now.toISOString(), resulting_session_id: session.id }).eq("id", initialIntent.id));

  const firstNotices = await one("first notification", db.from("on_street_pilot_notifications").select("*").eq("session_id", session.id).eq("target_expires_at", firstExpiry.toISOString()));
  assert.equal(firstNotices.length, 1);
  ids.notifications.push(firstNotices[0].id);
  const eligibilityCheck = (notification, at) => isEligibleOnStreetSmsNotification(db, notification, at);
  const first = await processDueOnStreetSms({ origin: process.env.PARKFACIL_PUBLIC_BASE_URL, provider: simulatedSmsProvider, db, now: now.toISOString(), eligibilityCheck, onlyNotificationIds: [firstNotices[0].id] });
  assert.equal(first.length, 1);
  const firstTracked = await one("first tracking", db.from("on_street_pilot_notifications").select("status,provider,attempts,provider_message_id,sent_at,target_expires_at").eq("id", firstNotices[0].id).single());
  assert.equal(firstTracked.status, "SENT"); assert.equal(firstTracked.provider, "SIMULATED"); assert.equal(firstTracked.attempts, 1); assert.ok(firstTracked.provider_message_id); assert.ok(firstTracked.sent_at);
  const repeated = await processDueOnStreetSms({ origin: process.env.PARKFACIL_PUBLIC_BASE_URL, provider: simulatedSmsProvider, db, now: now.toISOString(), eligibilityCheck, onlyNotificationIds: [firstNotices[0].id] });
  assert.equal(repeated.length, 0);

  const extensionIntent = await one("extension intent", db.from("on_street_payment_intents").insert({ ...commonIntent, operation_type: "EXTENSION", target_session_id: session.id, idempotency_key: `sms-e2e-extension-${crypto.randomUUID()}` }).select("id").single());
  ids.intents.push(extensionIntent.id);
  const extensionTransaction = await one("extension transaction", db.from("payment_transactions").insert({ provider: "TRANSBANK_WEBPAY", source_type: "ON_STREET_EXTENSION", source_id: extensionIntent.id, amount, currency: "CLP", buy_order: `SMSE2EX${Date.now()}`.slice(0, 26), provider_session_id: crypto.randomUUID(), idempotency_key: `sms-e2e-ext-tx-${crypto.randomUUID()}`, status: "COMMITTED", provider_status: "AUTHORIZED", response_code: 0, committed_at: now.toISOString() }).select("id").single());
  ids.transactions.push(extensionTransaction.id);
  const extension = await one("extension", db.from("on_street_pilot_extensions").insert({ session_id: session.id, additional_minutes: 30, rate_id: fixture.rate.id, rate_per_minute: Number(fixture.rate.minute_amount), simulated_amount: amount * 2, previous_expires_at: firstExpiry.toISOString(), new_expires_at: secondExpiry.toISOString(), origin: "WEBPAY", payment_transaction_id: extensionTransaction.id }).select("id").single());
  ids.extensions.push(extension.id);
  await one("session extension", db.from("on_street_pilot_sessions").update({ expires_at: secondExpiry.toISOString(), purchased_minutes: 45, simulated_amount: amount * 3, amount_paid: amount * 3 }).eq("id", session.id));
  const extendedIdentity = await one("extended identity", db.from("on_street_pilot_sessions").select("license_plate_normalized,phone_normalized").eq("id", session.id).single());
  assert.equal(extendedIdentity.license_plate_normalized, licensePlate); assert.equal(extendedIdentity.phone_normalized, phone);
  await one("extension intent result", db.from("on_street_payment_intents").update({ status: "PAID", paid_at: now.toISOString(), resulting_session_id: session.id }).eq("id", extensionIntent.id));
  const secondNotices = await one("second notification", db.from("on_street_pilot_notifications").select("*").eq("session_id", session.id).eq("target_expires_at", secondExpiry.toISOString()));
  assert.equal(secondNotices.length, 1); ids.notifications.push(secondNotices[0].id);
  const secondRunAt = new Date(secondExpiry.getTime() - 15 * 60_000).toISOString();
  const second = await processDueOnStreetSms({ origin: process.env.PARKFACIL_PUBLIC_BASE_URL, provider: simulatedSmsProvider, db, now: secondRunAt, eligibilityCheck, onlyNotificationIds: [secondNotices[0].id] });
  assert.equal(second.length, 1);
  const allSent = await one("sent cycles", db.from("on_street_pilot_notifications").select("id,status,provider,target_expires_at").eq("session_id", session.id).eq("status", "SENT"));
  assert.equal(allSent.length, 2);

  await one("third cycle", db.from("on_street_pilot_sessions").update({ expires_at: thirdExpiry.toISOString() }).eq("id", session.id));
  const thirdPending = await one("third notification", db.from("on_street_pilot_notifications").select("id,status").eq("session_id", session.id).eq("target_expires_at", thirdExpiry.toISOString()).single());
  ids.notifications.push(thirdPending.id); assert.equal(thirdPending.status, "PENDING");
  await one("close session", db.from("on_street_pilot_sessions").update({ status: "CLOSED", ended_at: now.toISOString(), duration_seconds: 1 }).eq("id", session.id));
  const thirdCancelled = await one("cancelled notification", db.from("on_street_pilot_notifications").select("status").eq("id", thirdPending.id).single());
  assert.equal(thirdCancelled.status, "CANCELLED");

  const expiredPhone = `+569${crypto.randomUUID().replace(/\D/g, "").padEnd(8, "1").slice(0, 8)}`;
  const expiringSession = await one("expiring session", db.from("on_street_pilot_sessions").insert({ qr_location_id: fixture.location.id, parking_id: fixture.location.parking_id, license_plate_normalized: `EX${suffix.slice(0, 4)}`, phone_normalized: expiredPhone, status: "ACTIVE", started_at: now.toISOString(), purchased_minutes: 15, rate_id: fixture.rate.id, rate_per_minute: Number(fixture.rate.minute_amount), simulated_amount: amount, amount_paid: amount, expires_at: firstExpiry.toISOString(), operational_number: `SMS-E2E-${crypto.randomUUID()}` }).select("id").single());
  ids.sessions.push(expiringSession.id);
  const expiringNotice = await one("expiring notice", db.from("on_street_pilot_notifications").select("id,status").eq("session_id", expiringSession.id).single());
  ids.notifications.push(expiringNotice.id); assert.equal(expiringNotice.status, "PENDING");
  await one("expire session", db.from("on_street_pilot_sessions").update({ status: "EXPIRED" }).eq("id", expiringSession.id));
  const expiredCancelled = await one("expired cancellation", db.from("on_street_pilot_notifications").select("status").eq("id", expiringNotice.id).single());
  assert.equal(expiredCancelled.status, "CANCELLED");

  console.log(JSON.stringify({ ok: true, provider: "SIMULATED", platePersisted: true, phonePersisted: true, extensionIdentityPreserved: true, firstCycleSent: true, duplicatePrevented: true, extensionCycleSent: true, closeCancelledPending: true, expiryCancelledPending: true, sentCycles: allSent.length }));
} finally {
  const sql = new pg.Client({ connectionString: process.env.LOCAL_SUPABASE_DB_URL });
  await sql.connect();
  try {
    await sql.query("begin");
    if (ids.notifications.length) await sql.query("delete from public.on_street_pilot_notifications where id=any($1::uuid[])", [ids.notifications]);
    if (ids.extensions.length) await sql.query("delete from public.on_street_pilot_extensions where id=any($1::uuid[])", [ids.extensions]);
    if (ids.intents.length) await sql.query("update public.on_street_payment_intents set status='CANCELLED',paid_at=null,resulting_session_id=null where id=any($1::uuid[])", [ids.intents]);
    if (ids.sessions.length) await sql.query("update public.on_street_pilot_sessions set payment_transaction_id=null where id=any($1::uuid[])", [ids.sessions]);
    if (ids.transactions.length) await sql.query("delete from public.payment_transactions where id=any($1::uuid[])", [ids.transactions]);
    if (ids.intents.length) await sql.query("delete from public.on_street_payment_intents where id=any($1::uuid[])", [ids.intents]);
    if (ids.sessions.length) await sql.query("delete from public.on_street_pilot_sessions where id=any($1::uuid[])", [ids.sessions]);
    await sql.query("commit");
  } catch (error) { await sql.query("rollback"); throw error; }
  finally { await sql.end(); }
}
