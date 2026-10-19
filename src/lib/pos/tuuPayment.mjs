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

// Paquete TUU de producción: SOLO referencia documental (fase TUU-02). No se
// usa en ningún flujo; la selección DEV/PROD pertenece al build de la APK.
export const TUU_PACKAGE_PROD = "com.haulmer.paymentapp";

// Tope defensivo de espera por el resultado real de TUU (Activity Result
// asíncrono, ver MainActivity.deliverTuuResultToWeb en
// parkfacil-pos-android). Si TUU no responde dentro de este plazo, el
// llamador debe resolver con un resultado NO_RESPONSE en vez de colgarse
// indefinidamente -- nunca bloquea el POS.
export const TUU_RESULT_TIMEOUT_MS = 120000;

// Valor TUU para deshabilitar por completo propina (tip) y vuelto (cashback).
export const TUU_DISABLED = -1;

// Tipo de tarjeta ParkFacil <-> method TUU. DÉBITO = 2, CRÉDITO = 1.
export function tuuMethodForCardType(cardType) {
  if (cardType === "DEBIT") return TUU_METHOD.DEBIT;
  if (cardType === "CREDIT") return TUU_METHOD.CREDIT;
  return null;
}

export function cardTypeForTuuMethod(method) {
  if (method === TUU_METHOD.DEBIT) return "DEBIT";
  if (method === TUU_METHOD.CREDIT) return "CREDIT";
  return null;
}

export function isValidTuuMethod(value) {
  return value === TUU_METHOD.CREDIT || value === TUU_METHOD.DEBIT;
}

// Arma el payload de pago TUU solo con datos que realmente existen en el
// flujo ParkFacil: `amount` es el total ya cotizado/confirmado (mismo valor
// que usa el recibo de EFECTIVO) y `netAmount` viene del mismo desglose
// Neto/IVA que ya calcula getTaxBreakdown en PosTerminal.js -- nunca
// recalculado ni inventado acá. `tip`/`cashback` van en -1: ParkFacil no
// maneja propina ni vuelto y -1 es el valor que TUU documenta para
// deshabilitarlos por completo (definición del usuario, fase TUU-02; el 0
// anterior dejaba la decisión a la app de pago). Campos documentados por TUU pero SIN dato
// real disponible hoy en ParkFacil (dteType, extraData.sourceVersion,
// extraData.customFields, un taxIdnValidation no vacío) se OMITEN a
// propósito en vez de rellenarse con un valor inventado.
//
// extraData.netAmount / exemptAmount (auditoría 2026-10-11): TUU documenta
// "amount = netAmount + exemptAmount" y netAmount como "Monto afecto (incluye
// IVA)". El cobro de estacionamiento es íntegramente afecto, así que
// netAmount = amount y exemptAmount = 0. Antes se enviaba el neto SIN IVA
// (p. ej. 840 para un amount de 1000), lo que no cumple esa regla.
export function buildTuuPaymentPayload({ amount, method } = {}) {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("amount debe ser un número mayor a 0.");
  }
  if (!isValidTuuMethod(method)) {
    throw new Error("method debe ser TUU_METHOD.CREDIT o TUU_METHOD.DEBIT.");
  }

  const payload = {
    amount: Math.round(normalizedAmount),
    tip: TUU_DISABLED,
    cashback: TUU_DISABLED,
    method,
    printVoucherOnApp: true,
    extraData: {
      taxIdnValidation: "",
      exemptAmount: 0,
      netAmount: Math.round(normalizedAmount),
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
    // Datos tal como los entregó TUU, para decidir con certeza si hubo cobro.
    tuuErrorCode: errorCode,
    tuuErrorCodeOnApp: errorCodeOnApp,
    transactionStatus: typeof data.transactionStatus === "boolean" ? data.transactionStatus : null,
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

// ---------------------------------------------------------------------------
// Fase TUU-02: desenlace de un intento de pago.
//
// Convierte lo que devuelve la espera del pago (startTuuPayment en
// PosTerminal.js / tuuResultRouter.mjs) en uno de cinco desenlaces. La regla
// de seguridad es: SOLO se permite volver a cobrar cuando consta que TUU no
// cobró (NOT_STARTED, DECLINED, CANCELLED). Todo lo demás que no sea un
// aprobado claro es UNCERTAIN -- nunca "rechazado" por descarte.
// ---------------------------------------------------------------------------

export const TUU_OUTCOME = Object.freeze({
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
  CANCELLED: "CANCELLED",
  NOT_STARTED: "NOT_STARTED",
  UNCERTAIN: "UNCERTAIN",
});

// Códigos con los que consta que la app de pago TUU nunca llegó a abrirse.
const TUU_NOT_STARTED_CODES = new Set([
  "TUU_NOT_INSTALLED",
  "TUU_BRIDGE_UNAVAILABLE",
  "TUU_LAUNCHER_UNAVAILABLE",
  "TUU_LAUNCH_FAILED",
  "INVALID_PAYLOAD",
  // APK 0.4.0 (SOL-2026-10-11-001): la APK rechazó el lanzamiento antes de
  // abrir TUU (otro pago en curso o resultado sin confirmar en el equipo,
  // intento no guardado, ambiente no habilitado). Para ESTE intento consta que
  // TUU no se abrió.
  "TUU_PAYMENT_IN_PROGRESS",
  "TUU_ATTEMPT_ID_INVALID",
  "TUU_ATTEMPT_NOT_PERSISTED",
  "TUU_ATTEMPT_STORE_UNAVAILABLE",
  "TUU_ENVIRONMENT_NOT_ENABLED",
  "TUU_ENVIRONMENT_MISCONFIGURED",
]);

// Tabla "errorCode" de errores PRE-transaccionales de la documentación de TUU
// (developers.tuu.cl, Inter-App; consultada el 2026-10-11): validación de
// parámetros o configuración del terminal. El 10 (cancelada por el usuario)
// se trata aparte; el 9 ("Error en proceso de pago") se excluye a propósito
// porque ocurre DURANTE el pago.
export const TUU_PRE_TRANSACTION_ERROR_CODES = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21",
  "I-01", "I-02", "I-03", "I-04",
]);

// errorCodeOnApp documentado para "La transacción fue cancelada".
export const TUU_ERROR_ON_APP_CANCELLED = "ICE-10";

export function classifyTuuOutcome(outcome) {
  if (!outcome || typeof outcome !== "object") {
    return { outcome: TUU_OUTCOME.UNCERTAIN, code: "NO_OUTCOME" };
  }
  if (!outcome.delivered) {
    const code = outcome.code || "UNKNOWN";
    if (TUU_NOT_STARTED_CODES.has(code)) return { outcome: TUU_OUTCOME.NOT_STARTED, code };
    // NO_RESPONSE (tiempo de espera), excepción del bridge o código
    // desconocido: TUU pudo haber cobrado.
    return { outcome: TUU_OUTCOME.UNCERTAIN, code };
  }
  const result = outcome.result;
  if (result?.success === true) return { outcome: TUU_OUTCOME.APPROVED, code: null };
  const tuu = classifyTuuTransactionResult(result?.rawResponse);
  if (tuu) {
    if (tuu.cancelled) return { outcome: TUU_OUTCOME.CANCELLED, code: tuu.errorCode };
    if (!tuu.tuuErrorCode && tuu.tuuErrorCodeOnApp === TUU_ERROR_ON_APP_CANCELLED) return { outcome: TUU_OUTCOME.CANCELLED, code: tuu.tuuErrorCodeOnApp };
    // "No hubo cobro" solo cuando consta: error pre-transaccional documentado
    // (validación/configuración: el cobro no llegó a intentarse) o flujo
    // completado con transactionStatus = false y sin código de error (rechazo
    // informado por TUU). Cualquier otro código -- error durante el proceso de
    // pago (9), códigos HP-* post-transaccionales (tiempo de respuesta
    // excedido, error de red, etc.) o códigos no documentados -- NO se asume
    // rechazo: queda como resultado incierto hasta confirmarlo en la app TUU.
    if (tuu.tuuErrorCode && TUU_PRE_TRANSACTION_ERROR_CODES.has(tuu.tuuErrorCode)) return { outcome: TUU_OUTCOME.DECLINED, code: tuu.tuuErrorCode };
    if (!tuu.tuuErrorCode && !tuu.tuuErrorCodeOnApp && tuu.transactionStatus === false) return { outcome: TUU_OUTCOME.DECLINED, code: "TRANSACTION_STATUS_FALSE" };
    return { outcome: TUU_OUTCOME.UNCERTAIN, code: tuu.errorCode || "UNKNOWN_TUU_RESULT" };
  }
  // Sin transactionResult interpretable. Solo la cancelación informada por
  // Android (RESULT_CANCELED: volver atrás en TUU) es un "no cobró".
  if (result?.cancelled === true && !result?.rawResponse) return { outcome: TUU_OUTCOME.CANCELLED, code: result?.responseCode || null };
  return { outcome: TUU_OUTCOME.UNCERTAIN, code: result?.responseCode || "INVALID_RESULT" };
}
