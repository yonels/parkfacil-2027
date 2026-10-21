import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleOnStreetSmsNotification } from "./onStreetSmsEligibility.mjs";

function dbFor({ sessionStatus = "ACTIVE", phone = "+56912345678", expiresAt = "2026-08-24T10:15:00.000Z", paymentStatus = "COMMITTED", extensionPaymentId = null } = {}) {
  const tables = {
    on_street_pilot_sessions: [{ id: "s1", status: sessionStatus, phone_normalized: phone, expires_at: expiresAt, payment_transaction_id: "pay-initial" }],
    on_street_pilot_extensions: extensionPaymentId ? [{ session_id: "s1", new_expires_at: expiresAt, payment_transaction_id: extensionPaymentId }] : [],
    payment_transactions: [{ id: extensionPaymentId || "pay-initial", status: paymentStatus }],
  };
  return { from(name) { const filters = []; const api = { select() { return api; }, eq(key, value) { filters.push([key, value]); return api; }, order() { return api; }, limit() { return api; }, async maybeSingle() { return { data: (tables[name] || []).find((row) => filters.every(([key, value]) => row[key] === value)) || null, error: null }; } }; return api; } };
}

const notification = { session_id: "s1", type: "EXPIRING_SOON", phone_normalized: "+56912345678", target_expires_at: "2026-08-24T10:15:00.000Z" };
const now = "2026-08-24T10:00:00.000Z";

test("T-15 elegible exige sesion activa, ciclo vigente, telefono valido y pago comprometido", async () => assert.equal(await isEligibleOnStreetSmsNotification(dbFor(), notification, now), true));
test("mas de 15 minutos antes no es elegible", async () => assert.equal(await isEligibleOnStreetSmsNotification(dbFor(), notification, "2026-08-24T09:59:59.000Z"), false));
test("cerrada, cancelada o expirada no es elegible", async () => { for (const status of ["CLOSED", "CANCELLED", "EXPIRED"]) assert.equal(await isEligibleOnStreetSmsNotification(dbFor({ sessionStatus: status }), notification, now), false); });
test("telefono invalido o distinto al de la sesion no es elegible", async () => { assert.equal(await isEligibleOnStreetSmsNotification(dbFor(), { ...notification, phone_normalized: "9123" }, now), false); assert.equal(await isEligibleOnStreetSmsNotification(dbFor({ phone: "+56987654321" }), notification, now), false); });
test("pago no autorizado no es elegible", async () => assert.equal(await isEligibleOnStreetSmsNotification(dbFor({ paymentStatus: "REJECTED" }), notification, now), false));
test("una extension valida el pago del nuevo ciclo", async () => assert.equal(await isEligibleOnStreetSmsNotification(dbFor({ extensionPaymentId: "pay-extension" }), notification, now), true));
test("el vencimiento de un ciclo anterior deja de ser elegible tras extender", async () => assert.equal(await isEligibleOnStreetSmsNotification(dbFor({ expiresAt: "2026-08-24T11:15:00.000Z" }), notification, now), false));
