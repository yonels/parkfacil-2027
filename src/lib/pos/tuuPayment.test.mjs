import test from "node:test";
import assert from "node:assert/strict";
import { TUU_METHOD, buildTuuPaymentPayload, isValidTuuMethod, parseTuuResult } from "./tuuPayment.mjs";

test("TUU: isValidTuuMethod solo acepta CREDIT(1)/DEBIT(2)", () => {
  assert.equal(isValidTuuMethod(TUU_METHOD.CREDIT), true);
  assert.equal(isValidTuuMethod(TUU_METHOD.DEBIT), true);
  assert.equal(isValidTuuMethod(0), false);
  assert.equal(isValidTuuMethod(undefined), false);
});

test("TUU: buildTuuPaymentPayload arma el payload débito con los campos reales", () => {
  const payload = buildTuuPaymentPayload({ amount: 3500, method: TUU_METHOD.DEBIT, netAmount: 2941 });
  assert.deepEqual(payload, {
    amount: 3500,
    tip: 0,
    cashback: 0,
    method: TUU_METHOD.DEBIT,
    printVoucherOnApp: true,
    extraData: {
      taxIdnValidation: "",
      exemptAmount: 0,
      netAmount: 2941,
      sourceName: "ParkFacil POS",
    },
  });
});

test("TUU: buildTuuPaymentPayload agrega installmentsQuantity=1 solo en crédito", () => {
  const credit = buildTuuPaymentPayload({ amount: 1000, method: TUU_METHOD.CREDIT, netAmount: 840 });
  assert.equal(credit.installmentsQuantity, 1);

  const debit = buildTuuPaymentPayload({ amount: 1000, method: TUU_METHOD.DEBIT, netAmount: 840 });
  assert.equal("installmentsQuantity" in debit, false);
});

test("TUU: buildTuuPaymentPayload redondea amount/netAmount sin inventar decimales", () => {
  const payload = buildTuuPaymentPayload({ amount: 3500.6, method: TUU_METHOD.DEBIT, netAmount: 2941.2 });
  assert.equal(payload.amount, 3501);
  assert.equal(payload.extraData.netAmount, 2941);
});

test("TUU: buildTuuPaymentPayload rechaza amount <= 0", () => {
  assert.throws(() => buildTuuPaymentPayload({ amount: 0, method: TUU_METHOD.DEBIT }));
  assert.throws(() => buildTuuPaymentPayload({ amount: -100, method: TUU_METHOD.DEBIT }));
  assert.throws(() => buildTuuPaymentPayload({ amount: Number.NaN, method: TUU_METHOD.DEBIT }));
});

test("TUU: buildTuuPaymentPayload rechaza method inválido", () => {
  assert.throws(() => buildTuuPaymentPayload({ amount: 1000, method: 9 }));
  assert.throws(() => buildTuuPaymentPayload({ amount: 1000, method: undefined }));
});

test("TUU: parseTuuResult normaliza una respuesta aprobada real del bridge", () => {
  const raw = JSON.stringify({
    success: true,
    cancelled: false,
    transactionId: "SEQ123",
    authorizationCode: null,
    amount: null,
    responseCode: null,
    responseMessage: null,
    paymentMethod: null,
    voucher: null,
    rawResponse: "{\"sequenceNumber\":\"SEQ123\"}",
  });
  const result = parseTuuResult(raw);
  assert.equal(result.success, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.transactionId, "SEQ123");
  assert.equal(result.authorizationCode, null);
});

test("TUU: parseTuuResult normaliza una respuesta rechazada con errorCode", () => {
  const raw = JSON.stringify({
    success: false,
    cancelled: false,
    transactionId: null,
    responseCode: "12",
    responseMessage: "Tarjeta rechazada",
  });
  const result = parseTuuResult(raw);
  assert.equal(result.success, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.responseCode, "12");
  assert.equal(result.responseMessage, "Tarjeta rechazada");
});

test("TUU: parseTuuResult normaliza una cancelación del usuario", () => {
  const raw = JSON.stringify({ success: false, cancelled: true, responseMessage: "Pago cancelado." });
  const result = parseTuuResult(raw);
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
});

test("TUU: parseTuuResult nunca lanza con JSON inválido o vacío", () => {
  const invalid = parseTuuResult("no-es-json");
  assert.equal(invalid.success, false);
  assert.equal(invalid.responseCode, "INVALID_RESULT");

  const empty = parseTuuResult(null);
  assert.equal(empty.success, false);
  assert.equal(empty.responseCode, "INVALID_RESULT");
});

test("TUU: parseTuuResult acepta un objeto ya parseado (no solo string)", () => {
  const result = parseTuuResult({ success: true, cancelled: false });
  assert.equal(result.success, true);
});
