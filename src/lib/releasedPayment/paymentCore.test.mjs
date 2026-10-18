import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizationPaymentStatus, currentPayment, describePayment, PAYMENT_STATUS, validatePaymentInput } from "./paymentCore.mjs";

// SOL-2026-10-16-003: pago del beneficiario registrado por el administrador,
// solo pagos recibidos, sin pagos parciales.

const authorization = { id: "a1", status: "ACTIVE", terms: { totalAmount: 60000 } };
const now = Date.parse("2026-10-16T15:00:00Z");

test("pago: el monto es siempre el total acordado (sin parciales)", () => {
  const ok = validatePaymentInput({ method: "transfer", paidAt: "2026-10-16T10:30", reference: "TRF-1" }, { authorization, now });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.amount, 60000);
  assert.equal(ok.value.method, "TRANSFER");
  assert.equal(ok.value.paidAt, "2026-10-16T13:30:00.000Z");
  const partial = validatePaymentInput({ method: "CASH", paidAt: "2026-10-16T10:30", amount: 30000 }, { authorization, now });
  assert.equal(partial.ok, false);
  assert.match(partial.errors.join(" "), /parciales/);
  assert.equal(validatePaymentInput({ method: "CASH", paidAt: "2026-10-16T10:30", amount: "60.000" }, { authorization, now }).ok, true);
});

test("pago: medio, fecha futura, detalle de 'Otro' y autorización activa", () => {
  assert.match(validatePaymentInput({ method: "WEBPAY", paidAt: "2026-10-16T10:30" }, { authorization, now }).errors.join(" "), /medio de pago/);
  assert.match(validatePaymentInput({ method: "CASH", paidAt: "2026-10-17T10:30" }, { authorization, now }).errors.join(" "), /futura/);
  assert.match(validatePaymentInput({ method: "CASH", paidAt: "" }, { authorization, now }).errors.join(" "), /fecha y hora/);
  assert.match(validatePaymentInput({ method: "OTHER", paidAt: "2026-10-16T10:30" }, { authorization, now }).errors.join(" "), /Otro/);
  assert.equal(validatePaymentInput({ method: "OTHER", paidAt: "2026-10-16T10:30", reference: "Vale 12" }, { authorization, now }).ok, true);
  assert.match(validatePaymentInput({ method: "CASH", paidAt: "2026-10-16T10:30" }, { authorization: { ...authorization, status: "REVOKED" }, now }).errors.join(" "), /no está activa/);
});

test("estado de pago: pagada solo con un pago vigente por el total", () => {
  const registered = { id: "p1", authorizationId: "a1", status: "REGISTERED", amount: 60000, method: "CASH", paidAt: "2026-10-16T13:30:00Z", reference: "" };
  const voided = { ...registered, id: "p0", status: "VOIDED" };
  assert.equal(authorizationPaymentStatus(authorization, []), PAYMENT_STATUS.PENDING);
  assert.equal(authorizationPaymentStatus(authorization, [voided]), PAYMENT_STATUS.PENDING);
  assert.equal(authorizationPaymentStatus(authorization, [voided, registered]), PAYMENT_STATUS.PAID);
  assert.equal(currentPayment([voided, registered], "a1").id, "p1");
  // Si las condiciones cambiaran (la base lo impide con un pago vigente), no
  // se considera pagada.
  assert.equal(authorizationPaymentStatus({ ...authorization, terms: { totalAmount: 90000 } }, [registered]), PAYMENT_STATUS.PENDING);
  assert.match(describePayment(registered), /60\.000 · Efectivo · recibido 16-10-2026 10:30/);
});
