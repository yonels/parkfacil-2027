import test from "node:test";
import assert from "node:assert/strict";
import {
  TUU_PRE_TRANSACTION_ERROR_CODES,
  TUU_DISABLED,
  TUU_METHOD,
  TUU_OUTCOME,
  TUU_PACKAGE_DEV,
  TUU_PACKAGE_PROD,
  buildTuuPaymentPayload,
  cardTypeForTuuMethod,
  classifyTuuOutcome,
  tuuMethodForCardType,
  classifyTuuTransactionResult,
  isValidTuuMethod,
  isValidTuuSequenceNumber,
  parseTuuResult,
} from "./tuuPayment.mjs";

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
    tip: -1,
    cashback: -1,
    method: TUU_METHOD.DEBIT,
    printVoucherOnApp: true,
    extraData: {
      taxIdnValidation: "",
      exemptAmount: 0,
      netAmount: 3500,
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
  assert.equal(payload.extraData.netAmount, 3501);
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
    rawResponse: "{\"transactionStatus\":true,\"sequenceNumber\":\"000012345678\"}",
  });
  const result = parseTuuResult(raw);
  assert.equal(result.success, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.transactionId, "000012345678");
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
  const result = parseTuuResult({ success: true, cancelled: false, rawResponse: { transactionStatus: true, sequenceNumber: "000000000001" } });
  assert.equal(result.success, true);
  assert.equal(result.transactionId, "000000000001");
});

test("TUU: RESULT_OK con transactionStatus=false (rechazo bancario) nunca es aprobado", () => {
  // APK anterior: marcaba success=true para todo RESULT_OK sin errorCode.
  const raw = JSON.stringify({
    success: true,
    cancelled: false,
    transactionId: "000012345678",
    rawResponse: JSON.stringify({ transactionStatus: false, sequenceNumber: "000012345678" }),
  });
  const result = parseTuuResult(raw);
  assert.equal(result.success, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.responseMessage, "Transacción rechazada.");
});

test("TUU: sin rawResponse (sin transactionResult) nunca es aprobado aunque el bridge diga success", () => {
  const result = parseTuuResult({ success: true, cancelled: false, transactionId: "000012345678" });
  assert.equal(result.success, false);
  assert.equal(result.transactionId, null);
});

test("TUU: errorCode alfanumérico (I-01) se conserva como texto", () => {
  const raw = JSON.stringify({
    success: false,
    cancelled: false,
    responseCode: "0",
    rawResponse: JSON.stringify({ errorCode: "I-01", errorMessage: "customFields: campos requeridos" }),
  });
  const result = parseTuuResult(raw);
  assert.equal(result.success, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.responseCode, "I-01");
  assert.equal(result.responseMessage, "customFields: campos requeridos");
});

test("TUU: errorCode 10 es cancelación del usuario; otro errorCode es rechazo", () => {
  const cancelled = parseTuuResult({ success: false, cancelled: false, rawResponse: JSON.stringify({ errorCode: 10, errorMessage: "Cancelada" }) });
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.responseCode, "10");

  // El APK anterior marcaba cancelado todo RESULT_CANCELED sin errorCode y
  // rechazo con errorCode; ahora decide el código documentado.
  const declined = parseTuuResult({ success: false, cancelled: true, rawResponse: JSON.stringify({ errorCode: 9, errorMessage: "Error en proceso de pago" }) });
  assert.equal(declined.cancelled, false);
  assert.equal(declined.responseCode, "9");
});

test("TUU: errorCodeOnApp/errorMessageOnApp se usan solo como respaldo", () => {
  const tuu = classifyTuuTransactionResult({ errorCode: 14, errorMessage: "", errorCodeOnApp: "ICE-14", errorMessageOnApp: "Sin internet" });
  assert.equal(tuu.errorCode, "14");
  assert.equal(tuu.errorMessage, "Sin internet");
  assert.equal(classifyTuuTransactionResult("no-json"), null);
});

test("TUU: sequenceNumber válido = 12 dígitos", () => {
  assert.equal(isValidTuuSequenceNumber("000012345678"), true);
  assert.equal(isValidTuuSequenceNumber("12345"), false);
  assert.equal(isValidTuuSequenceNumber("00001234567a"), false);
  assert.equal(isValidTuuSequenceNumber(123456789012), false);
});

// ---------------------------------------------------------------------------
// Fase TUU-02
// ---------------------------------------------------------------------------

test("TUU-02: DÉBITO genera method = 2 y CRÉDITO method = 1", () => {
  assert.equal(TUU_METHOD.DEBIT, 2);
  assert.equal(TUU_METHOD.CREDIT, 1);
  assert.equal(tuuMethodForCardType("DEBIT"), 2);
  assert.equal(tuuMethodForCardType("CREDIT"), 1);
  assert.equal(tuuMethodForCardType("CARD"), null);
  assert.equal(cardTypeForTuuMethod(2), "DEBIT");
  assert.equal(cardTypeForTuuMethod(1), "CREDIT");
  assert.equal(buildTuuPaymentPayload({ amount: 4500, method: tuuMethodForCardType("DEBIT"), netAmount: 3782 }).method, 2);
  assert.equal(buildTuuPaymentPayload({ amount: 4500, method: tuuMethodForCardType("CREDIT"), netAmount: 3782 }).method, 1);
});

test("TUU-02: tip = -1 y cashback = -1 en débito y en crédito", () => {
  assert.equal(TUU_DISABLED, -1);
  for (const method of [TUU_METHOD.DEBIT, TUU_METHOD.CREDIT]) {
    const payload = buildTuuPaymentPayload({ amount: 4500, method, netAmount: 3782 });
    assert.equal(payload.tip, -1);
    assert.equal(payload.cashback, -1);
    assert.equal(payload.printVoucherOnApp, true);
  }
});

test("TUU-02: payload final DÉBITO sin installmentsQuantity y payload final CRÉDITO con installmentsQuantity = 1", () => {
  assert.deepEqual(buildTuuPaymentPayload({ amount: 4500, method: TUU_METHOD.DEBIT, netAmount: 3782 }), {
    amount: 4500,
    tip: -1,
    cashback: -1,
    method: 2,
    printVoucherOnApp: true,
    extraData: { taxIdnValidation: "", exemptAmount: 0, netAmount: 4500, sourceName: "ParkFacil POS" },
  });
  assert.deepEqual(buildTuuPaymentPayload({ amount: 4500, method: TUU_METHOD.CREDIT, netAmount: 3782 }), {
    amount: 4500,
    tip: -1,
    cashback: -1,
    method: 1,
    printVoucherOnApp: true,
    extraData: { taxIdnValidation: "", exemptAmount: 0, netAmount: 4500, sourceName: "ParkFacil POS" },
    installmentsQuantity: 1,
  });
});

test("TUU-02: DEV usa com.haulmer.paymentapp.dev; el paquete de producción queda declarado pero sin uso", async () => {
  assert.equal(TUU_PACKAGE_DEV, "com.haulmer.paymentapp.dev");
  assert.equal(TUU_PACKAGE_PROD, "com.haulmer.paymentapp");
  const { readFile } = await import("node:fs/promises");
  const terminal = await readFile(new URL("../../components/pos/PosTerminal.js", import.meta.url), "utf8");
  assert.match(terminal, /TUU_PACKAGE_DEV/);
  assert.doesNotMatch(terminal, /TUU_PACKAGE_PROD/, "la web no referencia el paquete de producción");
  assert.doesNotMatch(terminal, /com\.haulmer\.paymentapp/, "el POS web no fija ningún paquete: lo decide el build de la APK");
});

const bridgeResult = (tuu) => ({ delivered: true, result: parseTuuResult({ success: false, cancelled: false, rawResponse: JSON.stringify(tuu) }) });

test("TUU-02: desenlace aprobado / rechazado / cancelado", () => {
  assert.equal(classifyTuuOutcome(bridgeResult({ transactionStatus: true, sequenceNumber: "000012345678" })).outcome, TUU_OUTCOME.APPROVED);
  const declined = classifyTuuOutcome(bridgeResult({ transactionStatus: false, errorCode: 5, errorMessage: "Tarjeta rechazada" }));
  assert.deepEqual(declined, { outcome: TUU_OUTCOME.DECLINED, code: "5" });
  const cancelled = classifyTuuOutcome(bridgeResult({ transactionStatus: false, errorCode: 10 }));
  assert.deepEqual(cancelled, { outcome: TUU_OUTCOME.CANCELLED, code: "10" });
  // Volver atrás en TUU (RESULT_CANCELED sin transactionResult).
  assert.equal(classifyTuuOutcome({ delivered: true, result: parseTuuResult({ success: false, cancelled: true, rawResponse: null }) }).outcome, TUU_OUTCOME.CANCELLED);
});

test("TUU-02: aplicación TUU no instalada o que no llegó a abrirse -> NOT_STARTED (único caso sin cobro posible además de rechazo/cancelación)", () => {
  for (const code of ["TUU_NOT_INSTALLED", "TUU_BRIDGE_UNAVAILABLE", "TUU_LAUNCHER_UNAVAILABLE", "TUU_LAUNCH_FAILED", "INVALID_PAYLOAD"]) {
    assert.deepEqual(classifyTuuOutcome({ delivered: false, code }), { outcome: TUU_OUTCOME.NOT_STARTED, code });
  }
});

test("TUU-02: tiempo de espera, respuesta inválida o desenlace desconocido -> RESULTADO INCIERTO (nunca rechazado)", () => {
  assert.deepEqual(classifyTuuOutcome({ delivered: false, code: "NO_RESPONSE" }), { outcome: TUU_OUTCOME.UNCERTAIN, code: "NO_RESPONSE" });
  assert.equal(classifyTuuOutcome({ delivered: false, code: "TUU_BRIDGE_EXCEPTION" }).outcome, TUU_OUTCOME.UNCERTAIN);
  assert.equal(classifyTuuOutcome({ delivered: false }).outcome, TUU_OUTCOME.UNCERTAIN);
  assert.equal(classifyTuuOutcome(null).outcome, TUU_OUTCOME.UNCERTAIN);
  assert.equal(classifyTuuOutcome({ delivered: true, result: parseTuuResult("{ json invalido") }).outcome, TUU_OUTCOME.UNCERTAIN);
  // RESULT_OK sin transactionResult: TUU terminó pero no dijo qué pasó.
  assert.equal(classifyTuuOutcome({ delivered: true, result: parseTuuResult({ success: false, cancelled: false, rawResponse: null }) }).outcome, TUU_OUTCOME.UNCERTAIN);
  // El bridge no pudo interpretar el JSON de TUU.
  assert.equal(classifyTuuOutcome({ delivered: true, result: parseTuuResult({ success: false, cancelled: false, responseCode: "PARSE_ERROR", rawResponse: "no-json" }) }).outcome, TUU_OUTCOME.UNCERTAIN);
});

// ---------------------------------------------------------------------------
// Auditoría 2026-10-11 (documentación TUU Inter-App consultada ese día)
// ---------------------------------------------------------------------------

test("auditoría: el payload cumple la regla documentada amount = netAmount + exemptAmount (netAmount = monto afecto con IVA)", () => {
  for (const method of [TUU_METHOD.DEBIT, TUU_METHOD.CREDIT]) {
    for (const amount of [20, 1000, 4500, 123457]) {
      const payload = buildTuuPaymentPayload({ amount, method });
      assert.equal(payload.extraData.netAmount + payload.extraData.exemptAmount, payload.amount);
      assert.equal(payload.extraData.exemptAmount, 0);
    }
  }
  // Un neto sin IVA entregado por el llamador ya no altera el payload.
  assert.equal(buildTuuPaymentPayload({ amount: 1000, method: TUU_METHOD.DEBIT, netAmount: 840 }).extraData.netAmount, 1000);
});

test("auditoría: cashback y cuotas respetan las validaciones de TUU (errores 4 y 5)", () => {
  // Error 5: cashback > -1 con método distinto de débito. Error 4: cuotas > -1 sin crédito.
  const credit = buildTuuPaymentPayload({ amount: 1000, method: TUU_METHOD.CREDIT });
  const debit = buildTuuPaymentPayload({ amount: 1000, method: TUU_METHOD.DEBIT });
  assert.equal(credit.cashback, -1);
  assert.equal(debit.cashback, -1);
  assert.equal("installmentsQuantity" in debit, false);
  assert.equal(credit.installmentsQuantity, 1);
});

const tuuOutcome = (tuu) => classifyTuuOutcome({ delivered: true, result: parseTuuResult({ success: false, cancelled: false, rawResponse: JSON.stringify(tuu) }) });

test("auditoría: solo es 'rechazado' (se puede reintentar) lo que consta que no cobró", () => {
  // Errores pre-transaccionales documentados: validación/configuración.
  for (const code of TUU_PRE_TRANSACTION_ERROR_CODES) {
    assert.equal(tuuOutcome({ errorCode: /^\d+$/.test(code) ? Number(code) : code, errorMessage: "x" }).outcome, TUU_OUTCOME.DECLINED, code);
  }
  assert.equal(TUU_PRE_TRANSACTION_ERROR_CODES.has("9"), false, "9 = error durante el proceso de pago");
  assert.equal(TUU_PRE_TRANSACTION_ERROR_CODES.has("10"), false, "10 = cancelación, se trata aparte");
  // Flujo completado con transactionStatus false y sin código de error.
  assert.deepEqual(tuuOutcome({ transactionStatus: false, sequenceNumber: "000000004719" }), { outcome: TUU_OUTCOME.DECLINED, code: "TRANSACTION_STATUS_FALSE" });
  // Cancelación.
  assert.equal(tuuOutcome({ errorCode: 10 }).outcome, TUU_OUTCOME.CANCELLED);
  assert.equal(tuuOutcome({ errorCodeOnApp: "ICE-10", errorMessageOnApp: "La transacción fue cancelada." }).outcome, TUU_OUTCOME.CANCELLED);
});

test("auditoría: error durante el pago, códigos HP post-transaccionales o desconocidos -> RESULTADO INCIERTO, nunca rechazado", () => {
  for (const tuu of [
    { errorCode: 9, errorMessage: "Error en proceso de pago." },
    { transactionStatus: false, errorCode: "HP-68", errorMessage: "Re-intente, tiempo de respuesta excedido" },
    { errorCode: "HP-NETWORK ERROR", errorMessage: "Error en la red" },
    { errorCode: "HP-ACK-Fail" },
    { errorCode: "HP-51", errorMessage: "Saldo insuficiente" },
    { errorCode: 99 },
    { errorCodeOnApp: "ICE-44", errorMessageOnApp: "No se pudo recuperar la información del flujo de transacción." },
    { sequenceNumber: "000000004719" },
    {},
  ]) {
    assert.equal(tuuOutcome(tuu).outcome, TUU_OUTCOME.UNCERTAIN, JSON.stringify(tuu));
  }
});
