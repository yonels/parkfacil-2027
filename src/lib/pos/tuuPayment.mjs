// Pago con tarjeta vía TUU (Haulmer) -- Inter-App / Android Intent, ambiente
// DEV (com.haulmer.paymentapp.dev). Reglas puras (sin DOM/bridge/window) para
// que sean 100% unit-testeables, mismo criterio que el resto de módulos
// "*Core.mjs"/".mjs" del proyecto (ver offStreetPlatePhoto.mjs,
// paymentsDayCore.mjs). La orquestación con el bridge nativo
// (window.ParkFacilDevice.payWithTuu) vive en PosTerminal.js, no acá -- mismo
// criterio que getNativePrinterBridge/executeNativePrint.
//
// Contrato verificado contra la documentación oficial de TUU
// (developers.tuu.cl, "Integración de aplicaciones de pago Inter-App"):
// - "amount" se expresa en PESOS CHILENOS ENTEROS (CLP), nunca centavos --
//   documentado como "Entero > 0, máximo 12 dígitos".
// - "method": 1 = crédito, 2 = débito (mismos valores que ya distinguen los
//   botones DÉBITO/CRÉDITO en PosTerminal.js -- dato real existente, no
//   inventado).

export const TUU_METHOD = Object.freeze({
  CREDIT: 1,
  DEBIT: 2,
});

// Paquete TUU DEV, único habilitado en esta etapa (ver TuuPaymentClient.kt en
// parkfacil-pos-android). PACKAGE_PROD queda reservado allá, no se referencia
// aquí -- este módulo no decide ni conoce el ambiente, solo arma el payload.
export const TUU_PACKAGE_DEV = "com.haulmer.paymentapp.dev";

// Tope defensivo de espera por el resultado real de TUU (Activity Result
// asíncrono, ver MainActivity.deliverTuuResultToWeb en
// parkfacil-pos-android). Si TUU no responde dentro de este plazo, el
// llamador debe resolver con un resultado NO_RESPONSE en vez de colgarse
// indefinidamente -- nunca bloquea el POS.
export const TUU_RESULT_TIMEOUT_MS = 120000;

export function isValidTuuMethod(value) {
  return value === TUU_METHOD.CREDIT || value === TUU_METHOD.DEBIT;
}

// Arma el payload de pago TUU solo con datos que realmente existen en el
// flujo ParkFacil: `amount` es el total ya cotizado/confirmado (mismo valor
// que usa el recibo de EFECTIVO) y `netAmount` viene del mismo desglose
// Neto/IVA que ya calcula getTaxBreakdown en PosTerminal.js -- nunca
// recalculado ni inventado acá. `tip`/`cashback` se dejan en 0 (sin propina
// ni vuelto -- ParkFacil no maneja ninguno de los dos hoy; TUU documenta -1
// como alternativa para "deshabilitar por completo", valor no confirmado
// aún -- ver informe de cierre). Campos documentados por TUU pero SIN dato
// real disponible hoy en ParkFacil (dteType, extraData.sourceVersion,
// extraData.customFields, un taxIdnValidation no vacío) se OMITEN a
// propósito en vez de rellenarse con un valor inventado.
export function buildTuuPaymentPayload({ amount, method, netAmount } = {}) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("amount debe ser un número mayor a 0.");
  }
  if (!isValidTuuMethod(method)) {
    throw new Error("method debe ser TUU_METHOD.CREDIT o TUU_METHOD.DEBIT.");
  }

  const payload = {
    amount: Math.round(normalizedAmount),
    tip: 0,
    cashback: 0,
    method,
    printVoucherOnApp: true,
    extraData: {
      taxIdnValidation: "",
      exemptAmount: 0,
      netAmount: Number.isFinite(Number(netAmount)) ? Math.round(Number(netAmount)) : 0,
      sourceName: "ParkFacil POS",
    },
  };

  // installmentsQuantity solo aplica a crédito -- documentado por TUU como
  // propio de ese medio; se omite en débito en vez de forzar un valor.
  if (method === TUU_METHOD.CREDIT) {
    payload.installmentsQuantity = 1;
  }

  return payload;
}

// Código TUU documentado para "Transacción cancelada por el usuario"
// (tabla errorCode, developers.tuu.cl Inter-App).
export const TUU_ERROR_USER_CANCELLED = "10";

// sequenceNumber: "cadena de 12 dígitos, identificador único" según TUU.
const TUU_SEQUENCE_NUMBER = /^\d{12}$/;

export function isValidTuuSequenceNumber(value) {
  return typeof value === "string" && TUU_SEQUENCE_NUMBER.test(value);
}

// errorCode puede ser numérico (1..21) o alfanumérico (I-01..I-04): se
// conserva siempre como texto.
function tuuCodeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

// Clasifica el JSON "transactionResult" tal como lo entrega TUU (campo
// rawResponse del bridge). Reglas de la documentación:
// - RESULT_OK llega también cuando el banco rechaza: solo transactionStatus
//   === true es un pago aprobado.
// - errorCode "10" = cancelado por el usuario; cualquier otro errorCode es
//   un error/rechazo.
// Devuelve null si rawResponse no es un JSON objeto (APK sin rawResponse).
export function classifyTuuTransactionResult(rawResponse) {
  const data = typeof rawResponse === "string" ? safeParseJson(rawResponse) : rawResponse;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const errorCode = tuuCodeText(data.errorCode);
  const errorCodeOnApp = tuuCodeText(data.errorCodeOnApp);
  const errorMessage = tuuCodeText(data.errorMessage) || tuuCodeText(data.errorMessageOnApp);
  const sequenceNumber = tuuCodeText(data.sequenceNumber);
  const approved = !errorCode && data.transactionStatus === true;

  return {
    approved,
    cancelled: errorCode === TUU_ERROR_USER_CANCELLED,
    errorCode: errorCode || (approved ? null : errorCodeOnApp),
    errorMessage,
    sequenceNumber,
  };
}

// Normaliza la respuesta cruda del bridge nativo (ver
// TuuPaymentClient.kt#toJson en parkfacil-pos-android) al contrato pedido
// para la UI. Nunca inventa un campo que el bridge no entregó -- si ya vino
// null/ausente allá, se mantiene null acá.
//
// La aprobación se decide SIEMPRE con el JSON original de TUU (rawResponse),
// no con el "success" del bridge: los APK anteriores marcaban aprobado todo
// RESULT_OK sin revisar transactionStatus. Sin rawResponse no hay pago
// aprobado.
export function parseTuuResult(raw) {
  const data = typeof raw === "string" ? safeParseJson(raw) : raw;
  if (!data || typeof data !== "object") {
    return {
      success: false,
      cancelled: false,
      transactionId: null,
      authorizationCode: null,
      amount: null,
      responseCode: "INVALID_RESULT",
      responseMessage: "Respuesta de TUU no interpretable.",
      paymentMethod: null,
      voucher: null,
      rawResponse: typeof raw === "string" ? raw : null,
    };
  }

  const tuu = classifyTuuTransactionResult(data.rawResponse);
  if (!tuu) {
    // Sin transactionResult de TUU: nunca aprobado. Se respeta la
    // cancelación informada por el bridge (RESULT_CANCELED sin datos).
    return {
      success: false,
      cancelled: Boolean(data.cancelled),
      transactionId: null,
      authorizationCode: data.authorizationCode ?? null,
      amount: data.amount ?? null,
      responseCode: tuuCodeText(data.responseCode),
      responseMessage: data.responseMessage ?? (data.cancelled ? "Pago cancelado." : "TUU no devolvió el resultado de la transacción."),
      paymentMethod: data.paymentMethod ?? null,
      voucher: data.voucher ?? null,
      rawResponse: typeof data.rawResponse === "string" ? data.rawResponse : null,
    };
  }

  const declinedMessage = tuu.cancelled ? "Pago cancelado." : "Transacción rechazada.";
  return {
    success: tuu.approved,
    cancelled: !tuu.approved && tuu.cancelled,
    transactionId: tuu.sequenceNumber,
    authorizationCode: data.authorizationCode ?? null,
    amount: data.amount ?? null,
    responseCode: tuu.approved ? null : tuu.errorCode,
    responseMessage: tuu.approved ? null : tuu.errorMessage || declinedMessage,
    paymentMethod: data.paymentMethod ?? null,
    voucher: data.voucher ?? null,
    rawResponse: data.rawResponse ?? null,
  };
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
