import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { receiptPaymentMethod, sanitizeTuuCardDetails, tuuCardDetailsFromRaw, tuuCardTypeFromMethod, tuuLast4 } from "./tuuCardDetails.mjs";
import { buildTuuRegistrationRequest, markTuuPaymentApproved, saveTuuPaymentStarted, TUU_PENDING_STATUS } from "./tuuPendingPayments.mjs";
import { paymentFromChargeSnapshot } from "./cardPaymentAttempts.mjs";

// Respuesta real de Pago-DEV (QA PRO2 2026-10-20): venta a crédito con una Visa Débito.
const RAW = JSON.stringify({ sequenceNumber: "130000046882", transactionStatus: true, transactionMethod: "Tarjeta de Crédito", last4: "****5223", authCode: "DEV001" });

test("TUU card details: sale type from transactionMethod and last 4 digits", () => {
  assert.deepEqual(tuuCardDetailsFromRaw(RAW), { cardType: "CREDIT", last4: "5223" });
  assert.equal(tuuCardTypeFromMethod("Tarjeta de Débito"), "DEBIT");
  assert.equal(tuuCardTypeFromMethod("tarjeta de debito"), "DEBIT");
  assert.equal(tuuCardTypeFromMethod("otro"), null);
  assert.equal(tuuLast4("****5101"), "5101");
  assert.equal(tuuLast4("12"), null);
  assert.deepEqual(tuuCardDetailsFromRaw("no json"), { cardType: null, last4: null });
});

test("server sanitizes TUU details; payment carries them for the registration RPC", () => {
  assert.deepEqual(sanitizeTuuCardDetails({ cardType: "DEBIT", last4: "5223" }), { cardType: "DEBIT", last4: "5223" });
  assert.equal(sanitizeTuuCardDetails({ cardType: "X", last4: "52a3" }), null);
  const payment = paymentFromChargeSnapshot({ totalAmount: 100 }, { paymentCode: "PAG-1", tuu: { cardType: "CREDIT", last4: "5223" } });
  assert.equal(payment.payment_card_type, "CREDIT");
  assert.equal(payment.card_last4, "5223");
  const plain = paymentFromChargeSnapshot({ totalAmount: 100 }, { paymentCode: "PAG-1" });
  assert.equal("payment_card_type" in plain, false);
  assert.equal("card_last4" in plain, false);
});

test("receipt method shows type and last 4 digits (printed as-is by the current APK)", () => {
  assert.equal(receiptPaymentMethod("DEBIT", "5223"), "Debito ****5223");
  assert.equal(receiptPaymentMethod("CREDIT", "5223"), "Credito ****5223");
  assert.equal(receiptPaymentMethod("CASH", "5223"), "CASH");
  assert.equal(receiptPaymentMethod("DEBIT", null), "DEBIT");
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}

test("approved local record keeps TUU type/last4 and the registration request sends them", () => {
  const storage = memoryStorage();
  const started = saveTuuPaymentStarted(storage, {
    stayId: "s1", attemptId: "11111111-1111-4111-8111-111111111111", idempotencyKey: "3f2c1a9e-8b7d-4c6e-9f10-aabbccddeeff",
    deviceId: "pos-0123456789abcdef01234567", ticketCode: "ING-261020003749-B83A", plate: "HHHJ-88", parkingId: "p1",
    parkingName: "Clínica Ramis Central", amount: 14130, cardType: "DEBIT", operatorId: "op-1", operatorName: "Operador", shiftId: "sh-1",
  });
  assert.equal(started.ok, true);
  const approved = markTuuPaymentApproved(storage, "s1", { sequenceNumber: "130000046882", cardType: "CREDIT", last4: "5223" });
  assert.equal(approved.record.status, TUU_PENDING_STATUS.PENDING_REGISTRATION);
  assert.equal(approved.record.tuuCardType, "CREDIT");
  assert.equal(approved.record.tuuLast4, "5223");
  assert.deepEqual(buildTuuRegistrationRequest(approved.record).cardPayment.tuu, { cardType: "CREDIT", last4: "5223" });
});

test("migration: TUU type prevails, selected type and last4 are stored", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261020090000_card_payment_tuu_details.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists card_last4 text null/);
  assert.match(sql, /add column if not exists card_type_selected text null/);
  assert.match(sql, /v_card_type := case when p_payment->>'payment_card_type' in \('CREDIT', 'DEBIT'\) then p_payment->>'payment_card_type' else v_attempt\.card_type end;/);
  assert.match(sql, /payment_card_type = v_card_type,\s*\n\s*card_type_selected = v_attempt\.card_type,\s*\n\s*card_last4 = v_last4,/);
});
