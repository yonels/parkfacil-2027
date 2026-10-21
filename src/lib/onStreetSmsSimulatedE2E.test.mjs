import test from "node:test";
import assert from "node:assert/strict";
import { processDueOnStreetSms } from "./onStreetSmsCore.mjs";
import { isEligibleOnStreetSmsNotification } from "./onStreetSmsEligibility.mjs";

function memoryDb(seed) {
  const tables = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  return {
    from(name) {
      const filters = []; let patch = null, limitN = null;
      const api = {
        select() { return api; }, update(values) { patch = values; return api; },
        eq(key, value) { filters.push((row) => row[key] === value); return api; },
        lte(key, value) { filters.push((row) => row[key] <= value); return api; },
        is(key, value) { filters.push((row) => row[key] == value); return api; },
        not(key) { filters.push((row) => row[key] != null); return api; },
        order() { return api; }, limit(value) { limitN = value; return api; },
        async maybeSingle() { const row = (tables[name] || []).find((item) => filters.every((filter) => filter(item))); if (!row) return { data: null, error: null }; if (patch) Object.assign(row, patch); return { data: { ...row }, error: null }; },
        then(resolve) { let rows = (tables[name] || []).filter((item) => filters.every((filter) => filter(item))); if (limitN != null) rows = rows.slice(0, limitN); resolve({ data: rows.map((row) => ({ ...row })), error: null }); },
      };
      return api;
    },
    tables,
  };
}

test("simulated E2E: elegibilidad, link seguro, tracking, idempotencia y nuevo ciclo tras extension", async () => {
  const firstExpiry = "2026-08-24T10:15:00.000Z", secondExpiry = "2026-08-24T11:15:00.000Z";
  const path = "/estacionar/sesion/123e4567-e89b-42d3-a456-426614174000";
  const db = memoryDb({
    on_street_pilot_notifications: [{ id: "n1", session_id: "s1", type: "EXPIRING_SOON", phone_normalized: "+56912345678", message: `ParkFacil: tu estacionamiento vence en 15 minutos. Extiende tu tiempo aqui: ${path}`, scheduled_at: "2026-08-24T10:00:00.000Z", target_expires_at: firstExpiry, status: "PENDING", attempts: 0 }],
    on_street_pilot_sessions: [{ id: "s1", status: "ACTIVE", phone_normalized: "+56912345678", expires_at: firstExpiry, payment_transaction_id: "p1" }],
    on_street_pilot_extensions: [], payment_transactions: [{ id: "p1", status: "COMMITTED" }],
  });
  const messages = [];
  const provider = { name: "SIMULATED", async send(payload) { messages.push(payload); return { ok: true, providerMessageId: `sim-${messages.length}` }; } };
  const eligibilityCheck = (notification, now) => isEligibleOnStreetSmsNotification(db, notification, now);
  await processDueOnStreetSms({ origin: "http://cliente.localhost:3000", provider, db, now: "2026-08-24T10:00:00.000Z", eligibilityCheck });
  await processDueOnStreetSms({ origin: "http://cliente.localhost:3000", provider, db, now: "2026-08-24T10:00:01.000Z", eligibilityCheck });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "+56912345678");
  assert.match(messages[0].message, /http:\/\/cliente\.localhost:3000\/estacionar\/sesion\/[0-9a-f-]{36}$/);
  assert.equal(db.tables.on_street_pilot_notifications[0].status, "SENT");
  assert.equal(db.tables.on_street_pilot_notifications[0].provider, "SIMULATED");
  assert.equal(db.tables.on_street_pilot_notifications[0].attempts, 1);

  db.tables.on_street_pilot_sessions[0].expires_at = secondExpiry;
  db.tables.on_street_pilot_extensions.push({ session_id: "s1", new_expires_at: secondExpiry, payment_transaction_id: "p2" });
  db.tables.payment_transactions.push({ id: "p2", status: "COMMITTED" });
  db.tables.on_street_pilot_notifications.push({ id: "n2", session_id: "s1", type: "EXPIRING_SOON", phone_normalized: "+56912345678", message: `ParkFacil: tu estacionamiento vence en 15 minutos. Extiende tu tiempo aqui: ${path}`, scheduled_at: "2026-08-24T11:00:00.000Z", target_expires_at: secondExpiry, status: "PENDING", attempts: 0 });
  await processDueOnStreetSms({ origin: "http://cliente.localhost:3000", provider, db, now: "2026-08-24T11:00:00.000Z", eligibilityCheck });
  assert.equal(messages.length, 2);
  assert.equal(db.tables.on_street_pilot_notifications[1].status, "SENT");
});
