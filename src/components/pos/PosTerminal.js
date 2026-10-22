"use client";

import { classifiedPaymentMethod, paymentMethodDisplay } from "@/lib/paymentCardType.mjs";
import PosPlateInput from "@/components/pos/PosPlateInput";
import PosHomeVehicles from "@/components/pos/PosHomeVehicles";
import { stampStaysReceivedAt } from "@/lib/pos/homeVehicles.mjs";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, LogOut, Menu, QrCode, RefreshCw, X } from "lucide-react";

import PosViewport from "@/components/pos/PosViewport";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { splitChileTaxFromTotal, toOperationalDateTimeParts } from "@/lib/dataEntry.mjs";
import { ticketHeaderData } from "@/lib/dataEntryPresentation.mjs";
import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";
import { extractDisplayUsername } from "@/lib/auth/accessUsernameDomain.mjs";
import { buildPrintableEntryPayload, entryPhotoRequirementMessage, platePhotoUnavailableMessage, resolvePlatePhotoPrintDecision } from "@/lib/offStreet/offStreetPlatePhoto.mjs";
import { buildAgentEntryTicketPayload, formatTicketCoordinates } from "@/lib/pos/entryTicketPayload.mjs";
import { photoToTicketRaster } from "@/lib/pos/ticketPhotoRaster.mjs";
import { TUU_METHOD, TUU_OUTCOME, TUU_PACKAGE_DEV, TUU_RESULT_TIMEOUT_MS, buildTuuPaymentPayload, classifyTuuOutcome, parseTuuResult } from "@/lib/pos/tuuPayment.mjs";
import { buildTuuRegistrationRequest, buildTuuResultReport, canStartTuuPayment, clearTuuPendingPayment, findTuuPendingPayment, findTuuPendingPaymentByAttempt, getOrCreatePosDeviceId, isProcessedTuuSequence, latestUnresolvedTuuPayment, loadQueuedTuuResultReports, loadTuuPendingPayments, markTuuPaymentApproved, markTuuPaymentUncertain, mergeTuuPendingViews, newTuuIdempotencyKey, noteTuuRegistrationFailure, queueTuuResultReport, reconcileTuuPendingWithServer, recoverTuuPendingPayments, rememberProcessedTuuSequence, removeQueuedTuuResultReport, saveTuuPaymentStarted, tuuRefreshResultMessage } from "@/lib/pos/tuuPendingPayments.mjs";
import { createTuuResultRouter } from "@/lib/pos/tuuResultRouter.mjs";
import { abandonNativeTuuAttempt, ackNativeTuuResult, planNativeTuuSync, readNativeDeviceId, readPendingTuuState, readTuuBridgeEnvironment, resolvePosDeviceId, shouldAbandonLostTuuAttempt, shouldAckTuuResult, tuuLaunchBridge } from "@/lib/pos/tuuNativeBridge.mjs";
import { TuuPendingPaymentCard, TuuPendingPaymentsAlert, TuuPendingPaymentsBanner } from "@/components/pos/PosTuuPendingPayments";
import PlatePhotoCapture from "@/components/pos/PlatePhotoCapture";
import QrTicketScanner from "@/components/pos/QrTicketScanner";
import { ChargeBreakdownList, ClosedUnpaidExitsSummary, DebtNoticeBanner, UnpaidExitAction, UnpaidExitsReview } from "@/components/pos/PosUnpaidExit";
import { summarizeChargeBreakdown } from "@/lib/parkingTimeBands.mjs";
import { receiptChargeLines, receiptExitInstant, receiptRateDescription } from "@/lib/pos/paymentReceiptCore.mjs";
import { QR_EXIT_STATUS, qrExitMessage, resolveStayFromQr, searchActiveStays } from "@/lib/pos/qrExitCore.mjs";
import { hasNativeQrScanner, scanQrWithNativeScanner } from "@/lib/pos/nativeQrScanner.mjs";
import { couponTokenForRequest, isCouponQrPayload } from "@/lib/cupones/couponInput.mjs";
import { classifyDiscountScan, COUPON_IN_TICKET_SCAN_MESSAGE, couponViewFromQuote, discountScanFailureMessage, DISCOUNT_SCAN_MESSAGES, isZeroTotalCouponCharge, receiptCouponLine } from "@/lib/pos/posCoupon.mjs";
import { receiptPaymentMethod, tuuCardDetailsFromRaw } from "@/lib/pos/tuuCardDetails.mjs";
import { buildPaymentsDayPrintPayload } from "@/lib/pos/paymentsDayCore.mjs";
import { classifyEntryFailure, entryErrorMessage, isPlateAlreadyInside, PLATE_SOURCES } from "@/lib/pos/entryPlateCore.mjs";
import { preloadPlateOcr, recognizePlate, releasePlateOcr } from "@/lib/pos/plateOcr";
import { detectLocalVoiceSupport, installLocalVoice, listenForPlate } from "@/lib/pos/plateVoice";

const POS_VIEWS = {
  HOME: "HOME",
  INGRESO: "INGRESO",
  SALIDA: "SALIDA",
  VEHICULOS: "VEHICULOS",
  VEHICULO_DETALLE: "VEHICULO_DETALLE",
  QR: "QR",
  BUSCAR: "BUSCAR",
  IMPRIMIR_LISTADO: "IMPRIMIR_LISTADO",
  CIERRE_CAJA: "CIERRE_CAJA",
  ESTADO_DISPOSITIVO: "ESTADO_DISPOSITIVO",
  PAGOS_DEL_DIA: "PAGOS_DEL_DIA",
  PAGOS_POR_RESOLVER: "PAGOS_POR_RESOLVER",
  TURNO: "TURNO",
};

const POS_PLATE_REGEX = /^[A-Z0-9]{4}-[0-9]{2}$/;

function formatPosPlateInput(value) {
  const compact = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const prefix = compact.slice(0, 4);
  const suffix = compact.slice(4).replace(/[^0-9]/g, "").slice(0, 2);
  if (!prefix) return "";
  if (prefix.length < 4) return prefix;
  return suffix ? `${prefix}-${suffix}` : `${prefix}-`;
}

function toBackendPlate(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizePlateInput(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function formatEntryDate(value) {
  const parts = toOperationalDateTimeParts(value);
  if (!parts) return { date: "-", time: "-" };
  return {
    date: parts.entryDate,
    time: parts.entryTime,
  };
}

function formatBridgeEntryDateTime(value) {
  return toOperationalDateTimeParts(value);
}

function formatTicketPlate(value) {
  const normalized = normalizePlateInput(value);
  if (normalized.length === 6) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  }
  return String(value ?? "").toUpperCase();
}

function buildEntryPrintPayload(stay, parkingResponse) {
  if (!stay || !parkingResponse) return null;
  const normalizedDateTime = formatBridgeEntryDateTime(stay.entry_at);
  if (!normalizedDateTime) return null;

  // Razón social/RUT/dirección/teléfono: mismo helper que ya usaba el
  // ticket histórico (dataEntryPresentation.mjs), con sus mismos fallbacks
  // ("No informado") — no se inventa formato nuevo para el encabezado.
  const header = ticketHeaderData(parkingResponse, stay, true);

  const payload = {
    type: "ENTRY",
    companyName: String(parkingResponse?.company?.business_name || parkingResponse?.company_name || "").trim(),
    razonSocial: header.businessName,
    rut: header.rut,
    direccion: header.address,
    telefono: header.phone,
    parkingName: String(parkingResponse?.name || "").trim(),
    parkingCode: String(parkingResponse?.code || "").trim(),
    operator: String(stay?.entry_operator_name || "").trim(),
    plate: formatTicketPlate(stay?.license_plate),
    entryDate: normalizedDateTime.entryDate,
    entryTime: normalizedDateTime.entryTime,
    ticketNumber: String(stay?.code || "").trim(),
    qrValue: String(stay?.qr_token || "").trim(),
  };

  if (!payload.companyName || !payload.parkingName || !payload.operator || !payload.ticketNumber || !payload.qrValue) {
    return null;
  }

  // Ticket del agente local (PT-210 / MTP-II): formato aprobado físicamente,
  // con datos de empresa opcionales y fecha con segundos -- se arma aquí,
  // con la MISMA estadía/parking que confirmó el backend, para que la
  // reimpresión reutilice exactamente el mismo contenido. El bridge nativo
  // (SUNMI) ignora este campo.
  const agentTicket = buildAgentEntryTicketPayload(stay, parkingResponse);
  if (agentTicket) payload.agentTicket = agentTicket;

  return payload;
}

// Arma el payload del recibo de pago EFECTIVO usando exclusivamente los datos
// que el backend devolvió tras confirmar el pago (stay/quote/parking del
// EXIT) — nunca el monto u otros valores que haya tenido el frontend antes
// de esa respuesta.
// boleta: boleta electrónica del pago en efectivo (SOL-2026-10-20-001), tal como
// la devuelve /api/data-entry. Las APK sin soporte ignoran los campos dte*.
function buildPaymentReceiptPayload(stay, quote, parkingResponse, paymentMethod = "CASH", boleta = null) {
  if (!stay || !quote || !parkingResponse) return null;
  const entryDateTime = formatBridgeEntryDateTime(stay.entry_at);
  // «Salida» = hora del cálculo de cobro (entrada + minutos cobrados), no la
  // confirmación del pago: así cuadra con «Tiempo» (SOL-2026-10-18-001).
  const exitDateTime = formatBridgeEntryDateTime(receiptExitInstant(stay, quote));
  if (!entryDateTime || !exitDateTime) return null;

  // El monto del comprobante es siempre el TOTAL ya confirmado por el
  // backend (EXIT); el desglose Neto/IVA solo se deriva de ese mismo valor,
  // nunca lo reemplaza. Contenido preparado para impresión, que se
  // implementará en una tarea aparte — no se toca aquí el mecanismo real.
  const amount = Number(quote?.total ?? stay?.total_amount ?? 0);
  const breakdown = getTaxBreakdown(amount);
  const header = ticketHeaderData(parkingResponse, stay, false);

  const payload = {
    type: "PAYMENT_RECEIPT",
    companyName: String(parkingResponse?.company?.business_name || parkingResponse?.company_name || "").trim(),
    razonSocial: header.businessName,
    rut: header.rut,
    direccion: header.address,
    telefono: header.phone,
    parkingName: String(parkingResponse?.name || "").trim(),
    parkingCode: String(parkingResponse?.code || "").trim(),
    operator: String(stay?.exit_operator_name || "").trim(),
    plate: formatTicketPlate(stay?.license_plate),
    ticketNumber: String(stay?.code || "").trim(),
    entryDate: entryDateTime.entryDate,
    entryTime: entryDateTime.entryTime,
    exitDate: exitDateTime.entryDate,
    exitTime: exitDateTime.entryTime,
    minutes: Number.isFinite(Number(quote?.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
    // SOL-2026-10-08-003: con franjas horarias se agrega un resumen del
    // desglose en la misma línea "Tarifa" (el formato impreso es fijo en la APK).
    // «Tarifa: Azul 2026 · $20 por minuto efectivo» (SOL-2026-10-18-001).
    rateDescription: receiptRateDescription(quote?.rate?.name || stay?.rate_name, quote?.snapshot?.chargeBreakdown, summarizeChargeBreakdown(quote?.snapshot?.chargeBreakdown)),
    // Detalle por franja horaria (APK con soporte de chargeLines; las anteriores lo ignoran).
    chargeLines: receiptChargeLines(quote?.snapshot?.chargeBreakdown),
    // Cupón aplicado (SOL-2026-10-19-002; APK 0.5.3+, las anteriores lo ignoran).
    coupon: receiptCouponLine(stay, quote),
    netAmount: breakdown.netAmount,
    vatAmount: breakdown.vatAmount,
    amount: breakdown.totalAmount,
    // Con tarjeta: "Debito ****5223" (tipo y últimos 4 dígitos según TUU).
    paymentMethod: receiptPaymentMethod(classifiedPaymentMethod(stay) || paymentMethod, stay?.card_last4),
    paymentId: String(stay?.payment_code || "").trim(),
    ...receiptBoletaFields(boleta),
  };
  // Con boleta emitida, Neto/IVA son los de la boleta (mismo total).
  if (boleta?.status === "ISSUED" && Number(boleta.totalAmount) === payload.amount && Number.isFinite(Number(boleta.netAmount))) {
    payload.netAmount = Number(boleta.netAmount);
    payload.vatAmount = Number(boleta.taxAmount);
  }

  if (!payload.companyName || !payload.parkingName || !payload.ticketNumber || !payload.paymentId) {
    return null;
  }

  return payload;
}

// Campos de la boleta electrónica para la APK: encabezado con folio y PDF417 del
// timbre (dteTed). Si quedó pendiente, solo la leyenda (dtePending).
function receiptBoletaFields(boleta) {
  if (!boleta) return {};
  if (boleta.status !== "ISSUED") return { dtePending: "Boleta electrónica pendiente de emisión" };
  return {
    dteType: "BOLETA ELECTRONICA",
    dteFolio: boleta.folio != null ? String(boleta.folio) : "",
    dteTed: boleta.ted || "",
    dteResolution: boleta.resolution || "",
    dteTest: boleta.environment === "TEST",
  };
}

// Comprobante de un pago con tarjeta armado al aprobar TUU, ANTES del registro
// (SOL-2026-10-11-001): montos del cálculo firmado y código PAG reservado al
// reservar el intento (el mismo con que se registra). Así se imprime en paralelo
// con el registro.
function buildEarlyCardReceiptPayload({ stay, snapshot, parkingResponse, paymentCode, cardType, operatorName, last4 = null }) {
  if (!stay || !snapshot || !paymentCode) return null;
  const paidStay = {
    ...stay,
    payment_code: paymentCode,
    payment_method: "CARD",
    payment_card_type: cardType || null,
    card_last4: last4 || null,
    exit_operator_name: operatorName || "",
    coupon_code: snapshot.couponCode || null,
    subtotal_amount: snapshot.subtotalAmount,
    discount_amount: snapshot.discountAmount,
    total_amount: snapshot.totalAmount,
  };
  const quote = { total: Number(snapshot.totalAmount || 0), elapsedMinutes: snapshot.elapsedMinutes, rate: { name: snapshot.rateName || stay.rate_name || null }, snapshot };
  return buildPaymentReceiptPayload(paidStay, quote, parkingResponse, "CARD");
}

function isQuoteSnapshotExpired(snapshot) {
  if (!snapshot?.expiresAt) return true;
  const expiresAt = new Date(snapshot.expiresAt);
  return Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date();
}

// Payload del comprobante de cierre de caja (type SHIFT_CLOSURE). Todos los
// montos/conteos vienen del cierre YA persistido por el backend
// (close_pos_shift) — nunca de un cálculo hecho en el frontend. operatorName
// y operatorEmail vienen de la sesión autenticada (context), no del actor
// de la API de turno (que solo trae id/rol).
function buildShiftClosureReceiptPayload(closure, parking, operatorName, operatorEmail) {
  if (!closure || !parking) return null;
  const shiftStarted = formatBridgeEntryDateTime(closure.shiftOpenedAt);
  const shiftClosed = formatBridgeEntryDateTime(closure.shiftClosedAt);
  if (!shiftStarted || !shiftClosed) return null;

  const payload = {
    type: "SHIFT_CLOSURE",
    companyName: String(parking?.company?.business_name || parking?.company_name || "").trim(),
    parkingName: String(parking?.name || "").trim(),
    parkingCode: String(parking?.code || "").trim(),
    operatorName: String(operatorName || "").trim(),
    operatorEmail: String(operatorEmail || "").trim(),
    shiftId: String(closure.shiftId || "").trim(),
    shiftStartedAt: closure.shiftOpenedAt,
    shiftClosedAt: closure.shiftClosedAt,
    shiftStartedDate: shiftStarted.entryDate,
    shiftStartedTime: shiftStarted.entryTime,
    shiftClosedDate: shiftClosed.entryDate,
    shiftClosedTime: shiftClosed.entryTime,
    confirmedPaymentsCount: closure.confirmedPaymentsCount,
    cancelledPaymentsCount: closure.cancelledPaymentsCount,
    cashAmount: closure.cashAmount,
    debitAmount: closure.debitAmount,
    creditAmount: closure.creditAmount,
    grossAmount: closure.grossAmount,
    cancelledAmount: closure.cancelledAmount,
    netAmount: closure.netAmount,
    declaredCashAmount: closure.declaredCashAmount,
    cashDifference: closure.cashDifference,
    differenceObservation: closure.differenceObservation,
    pendingVehiclesCount: closure.pendingVehiclesCount,
    pendingVehicles: Array.isArray(closure.pendingVehiclesSnapshot) ? closure.pendingVehiclesSnapshot : [],
    closureId: String(closure.id || "").trim(),
  };

  if (!payload.companyName || !payload.parkingName || !payload.shiftId || !payload.closureId) {
    return null;
  }

  return payload;
}

// Payload del listado de vehículos en el parking (type
// PARKING_VEHICLES_LIST). Reutiliza exactamente las mismas estadías OPEN
// que "VEHÍCULOS EN EL PARKING" (activeStays) — no arma una consulta
// paralela — y los minutos ya calculados server-side en stay.quote (nunca
// el reloj del navegador).
function buildParkingVehiclesListPayload(stays, parkingResponse, now) {
  if (!Array.isArray(stays) || !parkingResponse) return null;
  const generated = formatBridgeEntryDateTime(now);
  if (!generated) return null;

  const vehicles = stays.map((stay) => {
    const entry = formatEntryDate(stay?.entry_at);
    return {
      plate: formatTicketPlate(stay?.license_plate),
      ticketNumber: String(stay?.code || "").trim(),
      entryTime: entry.time,
      elapsedMinutes: Number.isFinite(Number(stay?.quote?.elapsedMinutes)) ? Number(stay.quote.elapsedMinutes) : null,
    };
  });

  const payload = {
    type: "PARKING_VEHICLES_LIST",
    companyName: String(parkingResponse?.company?.business_name || parkingResponse?.company_name || "").trim(),
    parkingName: String(parkingResponse?.name || "").trim(),
    parkingCode: String(parkingResponse?.code || "").trim(),
    generatedDate: generated.entryDate,
    generatedTime: generated.entryTime,
    totalVehicles: vehicles.length,
    vehicles,
  };

  if (!payload.companyName || !payload.parkingName) {
    return null;
  }

  return payload;
}

function getNativePrinterBridge() {
  if (typeof window === "undefined") return null;
  const bridge = window?.ParkFacilDevice;
  if (!bridge || typeof bridge.print !== "function") return null;
  return bridge;
}

// Ajuste final, §20: datos razonables del dispositivo para la evidencia
// (manufacturer/model/versión de app) -- reutiliza getDeviceInfo(), YA
// expuesto por el bridge nativo (ver ParkFacilDeviceBridge.kt), nunca un
// segundo mecanismo de identificación. Sin bridge (navegador/PC), se
// entrega el descriptor mínimo ya usado por WebDeviceAdapter.getDeviceInfo()
// -- ningún identificador extra, best-effort (nunca bloquea el ingreso).
async function collectDeviceInfoForEntry() {
  const bridge = typeof window !== "undefined" ? window?.ParkFacilDevice : null;
  if (bridge && typeof bridge.getDeviceInfo === "function") {
    try {
      const raw = await bridge.getDeviceInfo();
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      // Cae al descriptor web de abajo -- nunca bloquea el ingreso por esto.
    }
  }
  if (typeof navigator === "undefined") return null;
  return { platform: "web", userAgent: navigator.userAgent };
}

// ParkFacil POS -> TUU PRO2 (ambiente DEV): mismo criterio de
// feature-detection que getNativePrinterBridge -- nunca asume soporte, solo
// lo confirma comprobando que el método exista en window.ParkFacilDevice
// (ver payWithTuu en ParkFacilDeviceBridge.kt, repo parkfacil-pos-android).
function getTuuPaymentBridge() {
  if (typeof window === "undefined") return null;
  const bridge = window?.ParkFacilDevice;
  if (!bridge || typeof bridge.payWithTuu !== "function") return null;
  return bridge;
}

// payWithTuu() del bridge nativo es síncrono (como el resto del bridge) y
// solo confirma que el Intent de pago se lanzó -- el resultado real del pago
// es asíncrono (Activity Result de Android) y llega después, por separado,
// vía window.ParkFacilTuuResult(...) (ver MainActivity.deliverTuuResultToWeb
// en parkfacil-pos-android).
//
// Fase TUU-02: el receptor de ese resultado queda instalado de forma
// permanente (tuuResultRouter, ver src/lib/pos/tuuResultRouter.mjs). Al
// agotarse TUU_RESULT_TIMEOUT_MS la espera termina con NO_RESPONSE, pero el
// receptor sigue activo: una respuesta tardía de TUU ya no se descarta, se
// entrega a handleLateTuuResult.
const tuuResultRouter = createTuuResultRouter({
  // Una aprobación ya procesada (misma referencia TUU) que llega otra vez se
  // ignora: no puede resolver la espera de otro ticket ni registrarse dos veces.
  isDuplicate: (result) => isProcessedTuuSequence(getTuuPendingStorage(), result?.transactionId),
  onDuplicate: (result) => console.info("[pos:tuu]", { event: "DUPLICATE_RESULT_IGNORED", sequenceNumber: result?.transactionId || null }),
});

// Con la APK 0.4.0+ el pago se lanza con el identificador del intento
// (payWithTuuAttempt): la APK lo guarda antes de abrir TUU, no lo envía a TUU
// y lo devuelve junto al resultado. Con la APK 0.3.13 se usa payWithTuu, como
// hasta ahora. En ambos casos la reserva central ya ocurrió antes de llegar aquí.
function startTuuPayment(payloadJson, attemptId) {
  return tuuResultRouter.start(tuuLaunchBridge(getTuuPaymentBridge(), attemptId), payloadJson, TUU_RESULT_TIMEOUT_MS, { attemptId });
}

// Bridge nativo completo (o null en un navegador). Solo lectura de capacidades.
function getNativeDeviceBridge() {
  return typeof window !== "undefined" ? window?.ParkFacilDevice || null : null;
}

// Almacenamiento local del WebView para los pagos TUU sin cerrar (ver
// src/lib/pos/tuuPendingPayments.mjs). Nunca lanza: sin almacenamiento
// disponible devuelve null y el POS no inicia un pago con tarjeta.
function getTuuPendingStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Identificador de este equipo (se genera una vez y se conserva). Sin él no
// se inicia un pago con tarjeta.
// Con la APK 0.4.0+ se usa el identificador propio del equipo que entrega la
// APK (sobrevive a la limpieza de datos del WebView); si no existe, el que la
// web guarda en el WebView. Es un dato de trazabilidad, no una credencial.
function getPosDeviceId() {
  try {
    return resolvePosDeviceId(getNativeDeviceBridge(), () => getOrCreatePosDeviceId(getTuuPendingStorage()));
  } catch {
    return null;
  }
}

// Identificadores con los que este equipo pudo reservar intentos: el de la APK
// y el anterior del WebView (un intento reservado antes de actualizar la APK
// sigue siendo de este equipo).
function getKnownPosDeviceIds() {
  let webViewId = null;
  try {
    webViewId = getTuuPendingStorage()?.getItem?.("parkfacil.pos.device.v1") || null;
  } catch {
    webViewId = null;
  }
  return [readNativeDeviceId(getNativeDeviceBridge()), webViewId].filter(Boolean);
}

// Llamadas del POS a la reserva central de intentos de pago con tarjeta
// (/api/data-entry: CARD_PAYMENT_RESERVE / _SENT / _RESULT y EXIT por intento).
// Nunca lanza: un fallo de red vuelve como { ok: false, network: true }.
async function postCardPaymentAction(body) {
  try {
    const response = await fetch("/api/data-entry", {
      method: "POST",
      headers: { "content-type": "application/json", "x-parkfacil-portal": "terminal" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload: payload || {}, network: false, code: payload?.details?.code || payload?.code || null };
  } catch {
    return { ok: false, status: 0, payload: {}, network: true, code: "NETWORK_ERROR" };
  }
}

async function getPosCardPayments() {
  try {
    const response = await fetch("/api/pos/card-payments", { headers: { "x-parkfacil-portal": "terminal" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload: payload || {} };
  } catch {
    return { ok: false, status: 0, payload: {} };
  }
}

// Registro técnico de la integración TUU. Solo datos del ticket y la
// referencia que entrega TUU; nunca datos de la tarjeta.
function logTuu(event, record, extra = {}) {
  console.info("[pos:tuu]", {
    event,
    stayId: record?.stayId || null,
    ticket: record?.ticketCode || null,
    plate: record?.plate || null,
    parkingId: record?.parkingId || null,
    parking: record?.parkingName || null,
    operatorId: record?.operatorId || null,
    operator: record?.operatorName || null,
    shiftId: record?.shiftId || null,
    amount: record?.amount ?? null,
    cardType: record?.cardType || null,
    sequenceNumber: record?.sequenceNumber || null,
    attemptId: record?.attemptId || null,
    deviceId: record?.deviceId || null,
    ...extra,
  });
}

async function executeNativePrint(payload) {
  const bridge = getNativePrinterBridge();
  if (!bridge || !payload) return { attempted: false, ok: false };

  try {
    const raw = await bridge.print(JSON.stringify(payload));
    let response = raw;
    if (typeof raw === "string") {
      try {
        response = JSON.parse(raw);
      } catch {
        return {
          attempted: true,
          ok: false,
          code: "INVALID_BRIDGE_RESPONSE",
          message: `Respuesta no JSON: ${raw}`,
        };
      }
    }

    return {
      attempted: true,
      ok: Boolean(response?.ok),
      code: response?.code ? String(response.code) : "",
      message: response?.message ? String(response.message) : "",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      code: "PRINT_EXCEPTION",
      message: error instanceof Error ? error.message : String(error ?? "Error desconocido"),
    };
  }
}

// Agente local de impresión (piloto Windows/PC): mismo rol que el bridge
// Android nativo, pero para dispositivos sin ese bridge. Es un proceso
// aparte que escucha solo en 127.0.0.1, en la misma máquina — el detalle
// de impresora/puerto es responsabilidad exclusiva del agente, no de este
// componente (ver C:\proyectos\parkfacil-print-agent).
const PRINT_AGENT_URL = "http://127.0.0.1:19100/print";
// Token de emparejamiento del agente local (piloto, no es un secreto de
// producción: el agente solo escucha en localhost de esta misma máquina).
// Antes de un despliegue Android/TUU real esto debe reforzarse (rotación,
// no hardcodeo), según quedó documentado en el diseño del agente.
const PRINT_AGENT_TOKEN = "p9tMJvWWvuN70lKB4JLiGK98wS9o-buE";

async function tryLocalAgentPrint(agentPayload) {
  if (!agentPayload) return { attempted: false, ok: false };

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;

  try {
    const response = await fetch(PRINT_AGENT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-parkfacil-agent-token": PRINT_AGENT_TOKEN },
      body: JSON.stringify(agentPayload),
      signal: controller?.signal,
    });
    const result = await response.json().catch(() => ({}));
    return {
      attempted: true,
      ok: response.ok && Boolean(result.ok),
      code: result.code ? String(result.code) : "",
      message: result.message ? String(result.message) : "",
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      code: "AGENT_UNREACHABLE",
      message: error instanceof Error ? error.message : "El agente local de impresión no respondió.",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Traduce el payload histórico de impresión (pensado para el bridge
// Android) al esquema que espera el agente local — sin cambiar el payload
// original, que sigue siendo lo que recibe el bridge nativo tal cual.
function toAgentEntryPayload(payload) {
  if (!payload) return null;
  // Formato definitivo PT-210 (ver buildAgentEntryTicketPayload). El mapeo
  // de abajo queda solo para payloads construidos antes de este cambio.
  if (payload.agentTicket) return { ...payload.agentTicket };
  return {
    type: "ENTRY",
    razonSocial: payload.razonSocial,
    rut: payload.rut,
    direccion: payload.direccion,
    telefono: payload.telefono,
    parkingName: payload.parkingName,
    parkingCode: payload.parkingCode || undefined,
    patente: payload.plate,
    ticketNumber: payload.ticketNumber,
    fechaIngreso: payload.entryDate,
    horaIngreso: payload.entryTime,
    operador: payload.operator || undefined,
    qrValue: payload.qrValue,
  };
}

function toAgentExitPayload(payload) {
  if (!payload) return null;
  return {
    type: "EXIT",
    razonSocial: payload.razonSocial,
    rut: payload.rut,
    direccion: payload.direccion,
    telefono: payload.telefono,
    parkingName: payload.parkingName,
    parkingCode: payload.parkingCode || undefined,
    patente: payload.plate,
    ticketNumber: payload.paymentId,
    fechaHoraIngreso: `${payload.entryDate} ${payload.entryTime}`,
    fechaHoraSalida: `${payload.exitDate} ${payload.exitTime}`,
    tiempoTotal: Number.isFinite(payload.minutes) ? `${payload.minutes} minutos` : undefined,
    tarifa: payload.rateDescription || undefined,
    neto: formatCurrency(payload.netAmount),
    iva: formatCurrency(payload.vatAmount),
    monto: formatCurrency(payload.amount),
    medioPago: formatPaymentMethodLabel(payload.paymentMethod),
    operador: payload.operator || undefined,
    qrValue: payload.paymentId || undefined,
  };
}

// Fase 6 (fotografía de patente en el ticket): ni el bridge Android nativo
// ni el agente local de PC implementados en este repo soportan imágenes hoy
// (ver diagnóstico — ambos son de solo texto). Este es el único punto de
// feature-detection: "printWithImage" es un método hipotético que un bridge
// real (TUU u otro) tendría que exponer explícitamente. Mientras eso no
// exista, esto siempre resuelve a false y el ticket se imprime en texto
// solamente — nunca se asume soporte que no fue declarado por el bridge.
function bridgeSupportsPlatePhoto(bridge) {
  return Boolean(bridge && typeof bridge.printWithImage === "function");
}

// Intenta imprimir con fotografía cuando corresponde; si el bridge no
// declara soporte, o lo declara pero la llamada falla, se cae SIEMPRE al
// ticket de texto normal (§9 del encargo: un fallo de impresión gráfica
// nunca invalida un ingreso ya confirmado).
async function executeNativePrintWithPlatePhoto(payload, photoBase64, printPlatePhotoOnTicket) {
  const bridge = getNativePrinterBridge();
  if (!bridge || !payload) return { attempted: false, ok: false };

  const decision = buildPrintableEntryPayload(payload, {
    photoBase64,
    printOnTicket: printPlatePhotoOnTicket,
    bridgeSupportsImage: bridgeSupportsPlatePhoto(bridge),
  });

  if (decision.includePhoto) {
    try {
      const raw = await bridge.printWithImage(JSON.stringify(decision.payload));
      const response = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (response?.ok) return { attempted: true, ok: true, code: "", message: "", photoIncluded: true };
    } catch {
      // El bridge declaró soporte pero falló al imprimir la imagen: se cae
      // a texto sin propagar este error (fallback obligatorio, §9).
    }
  }

  const textResult = await executeNativePrint(payload);
  return { ...textResult, photoIncluded: false, photoSkippedReason: decision.reason || "IMAGE_PRINT_FAILED_FALLBACK_TEXT" };
}

// Resuelve el medio de impresión disponible en este dispositivo: primero
// el bridge Android nativo (POS real); si no existe, el agente local
// (Windows/PC). "toAgentPayload" traduce el payload histórico al esquema
// del agente solo cuando corresponde usarlo. El agente local de PC no tiene
// (hoy) ningún soporte de imagen -- siempre recibe el ticket de texto.
async function executeAutoPrint(payload, toAgentPayload, platePhoto) {
  const bridge = getNativePrinterBridge();
  if (bridge) {
    if (platePhoto?.photoBase64) {
      return executeNativePrintWithPlatePhoto(payload, platePhoto.photoBase64, platePhoto.printOnTicket);
    }
    return executeNativePrint(payload);
  }
  // Agente local (PT-210 / MTP-II): SÍ imprime la fotografía (raster ESC/POS
  // validado físicamente). Misma regla de decisión que el bridge nativo
  // (resolvePlatePhotoPrintDecision: configuración del parking + foto
  // disponible). Si la foto no se puede convertir, el ticket sale igual con
  // la patente en texto grande.
  const agentPayload = toAgentPayload(payload);
  if (agentPayload?.type === "ENTRY" && platePhoto?.photoBase64) {
    const decision = resolvePlatePhotoPrintDecision({
      printOnTicket: Boolean(platePhoto.printOnTicket),
      hasPhoto: true,
      bridgeSupportsImage: true,
    });
    const fotoRaster = decision.includePhoto ? await photoToTicketRaster(platePhoto.photoBase64) : null;
    if (fotoRaster) {
      const result = await tryLocalAgentPrint({ ...agentPayload, fotoRaster });
      return { ...result, photoIncluded: Boolean(result.ok) };
    }
  }
  return tryLocalAgentPrint(toAgentPayload(payload));
}

async function getSessionContext() {
  const response = await fetch("/api/auth/session", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  // Fase 1: también en error se lee el cuerpo ({ error, code }) -- el
  // código distingue un acceso revocado de una falla transitoria.
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload: payload || {} };
}

async function getPosVehicleSummary() {
  const response = await fetch("/api/pos/stays", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

// Con couponToken (SOL-2026-10-19-002) recalcula con el cupón por POST: el token
// del cupón no viaja en la URL.
async function getPosVehicleQuote(stayId, couponToken = null) {
  const response = await fetch(`/api/pos/stays/${encodeURIComponent(stayId)}/quote`, couponToken ? {
    method: "POST",
    headers: { "x-parkfacil-portal": "terminal", "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ couponToken }),
  } : {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function getPosPaymentsToday() {
  const response = await fetch("/api/pos/payments", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function getPosShift() {
  const response = await fetch("/api/pos/shift", {
    headers: { "x-parkfacil-portal": "terminal" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function postCloseShift(body) {
  const response = await fetch("/api/pos/shift/operator-close", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-parkfacil-portal": "terminal",
    },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

async function postStartShift(shiftId) {
  const response = await fetch("/api/pos/shift/start", {
    method: "POST",
    headers: { "content-type": "application/json", "x-parkfacil-portal": "terminal" },
    cache: "no-store",
    body: JSON.stringify({ shiftId }),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

// Inicio de turno a pedido (sin turno programado): el servidor crea y abre el
// turno de hoy. parkingId solo aplica con varios estacionamientos y se valida
// server-side contra los autorizados.
async function postStartOnDemandShift(parkingId = null) {
  const response = await fetch("/api/pos/shift/start", {
    method: "POST",
    headers: { "content-type": "application/json", "x-parkfacil-portal": "terminal" },
    cache: "no-store",
    body: JSON.stringify(parkingId ? { onDemand: true, parkingId } : { onDemand: true }),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value));
}

// El estado del vehículo mezcla dos formas de cotización distintas según su
// origen: la del listado (quoteParkingStay: blocked/total/rate.name) y la
// del detalle recién refrescado (toPagueAquiQuote: payable/amount/rateName,
// además del snapshot firmado). Sin este adaptador, leer directamente
// .blocked/.total/.rate.name contra una cotización en la forma pública
// siempre da "no pagable"/"sin tarifa", aunque el backend sí tenga un total
// válido — por eso se centraliza aquí en vez de repetir el chequeo de forma
// en cada lugar que lee la cotización.
function normalizeQuoteView(quote) {
  if (!quote) return null;
  // Pago liberado: minutos liberados/cobrables y salida sin cobro (total 0).
  const released = quote.released
    ? {
      coveredMinutes: Number(quote.released.coveredMinutes ?? Math.floor(Number(quote.released.coveredSeconds || 0) / 60)),
      chargeableMinutes: Number(quote.released.chargeableMinutes ?? Math.floor(Number(quote.released.chargeableSeconds || 0) / 60)),
    }
    : null;
  if ("payable" in quote || "amount" in quote) {
    return {
      payable: Boolean(quote.payable),
      total: Number.isFinite(Number(quote.amount)) ? Number(quote.amount) : null,
      rateName: quote.rateName || null,
      elapsedMinutes: Number.isFinite(Number(quote.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
      released,
      releasedNoCharge: quote.blockedReason === "RELEASED_NO_CHARGE",
    };
  }
  return {
    payable: !quote.blocked,
    total: Number.isFinite(Number(quote.total)) ? Number(quote.total) : null,
    rateName: quote.rate?.name || null,
    elapsedMinutes: Number.isFinite(Number(quote.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
    released,
    releasedNoCharge: Boolean(released) && !quote.blocked && Number(quote.total) === 0,
  };
}

function formatQuoteAmount(quote) {
  const view = normalizeQuoteView(quote);
  if (!view || !view.payable || view.total === null) return "—";
  return formatCurrency(view.total);
}

// Desglose tributario (Neto/IVA) a partir del TOTAL que ya calculó el
// backend — nunca lo recalcula ni lo reconstruye (neto * 1.19 !== total por
// redondeo). Delega la fórmula en splitChileTaxFromTotal (ya usada y
// probada en dataEntry.mjs) y solo expone los nombres que necesitan las
// pantallas de cobro/recibo; así el cálculo queda en un único lugar en vez
// de repetirse en cada bloque JSX.
function getTaxBreakdown(total) {
  const { net, tax, total: totalAmount } = splitChileTaxFromTotal(total);
  return { netAmount: net, vatAmount: tax, totalAmount };
}

function formatMinuteCount(quote) {
  if (!quote || !Number.isFinite(Number(quote.elapsedMinutes))) return "—";
  return String(Number(quote.elapsedMinutes));
}

function formatPaymentMethodLabel(method) {
  return paymentMethodDisplay(method).toUpperCase();
}

// POS Entry/Exit — Fase 1 (sesión y navegación). Toda salida hacia el login
// usa navegación "dura" (location.replace): descarta de una vez el estado en
// memoria del terminal (vehículo seleccionado, cobro en pantalla, etc.) y
// reemplaza la entrada del historial, para que "Atrás" no vuelva a una
// pantalla operativa. El motivo es una lista cerrada que /pos/login traduce
// a un mensaje (ver POS_LOGIN_REASONS en src/app/pos/login/page.js).
const POS_SESSION_REVALIDATE_MS = 60000;

function redirectToPosLogin(reason) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({ next: "/pos" });
  if (reason) params.set("motivo", reason);
  window.location.replace(`/pos/login?${params.toString()}`);
}

// 401 = sesión expirada/cuenta deshabilitada. En 403 solo los códigos que
// REALMENTE revocan el acceso (membresía inactiva/vencida, empresa
// suspendida, rol/portal/permiso no permitido) envían al login: un 403
// MEMBERSHIP_LOOKUP_FAILED/COMPANY_LOOKUP_FAILED es una falla transitoria
// de base de datos y nunca debe expulsar al operador en pleno turno.
const POS_REVOKED_ACCESS_CODES = new Set([
  "MEMBERSHIP_INACTIVE",
  "COMPANY_INACTIVE",
  "ACCESS_EXPIRED",
  "ROLE_FORBIDDEN",
  "PORTAL_FORBIDDEN",
  "PERMISSION_FORBIDDEN",
]);

function posLoginReasonForSessionStatus(status, code) {
  if (status === 401) return "sesion-expirada";
  if (status === 403 && POS_REVOKED_ACCESS_CODES.has(String(code || ""))) return "acceso-revocado";
  return null;
}

// Revalidación periódica: un 401 aislado puede ser un corte momentáneo de
// Supabase Auth -- se exige que se repita en revalidaciones consecutivas.
const POS_SESSION_UNAUTHORIZED_THRESHOLD = 2;

// Nunca se muestra el correo técnico interno (@acceso.parkfacilapp.cl):
// nombre de la membresía, o en su defecto solo el usuario de acceso.
function formatOperatorDisplayName(context) {
  const fullName = String(context?.membership?.fullName || "").trim();
  return fullName || extractDisplayUsername(context?.email) || "-";
}

function formatPosRoleLabel(role) {
  if (role === "operator") return "Operador POS";
  if (role === "company_admin") return "Administrador";
  return role || "-";
}

function formatDeviceInfoLabel(info) {
  if (!info) return "No disponible";
  if (info.platform === "web") return "Navegador web";
  const model = [info.manufacturer, info.model].filter(Boolean).join(" ");
  return model || "Dispositivo Android";
}

export default function PosTerminal() {
  const [loading, setLoading] = useState(true);
  // Fase 1 — entorno POS: selección explícita de estacionamiento (varios
  // autorizados), cierre de sesión en curso y datos del dispositivo.
  const [parkingSelectionRequired, setParkingSelectionRequired] = useState(false);
  const [parkingOptions, setParkingOptions] = useState([]);
  // Estacionamientos (varios autorizados) donde se puede abrir turno a pedido.
  const [onDemandParkings, setOnDemandParkings] = useState([]);
  // Selector Off Street: pulldown con los Off Street activos de la empresa,
  // estacionamiento del último cierre (para consultarlo/reimprimirlo cuando
  // ya no hay estacionamiento activo) y aviso de turno restaurado al volver
  // a ingresar con un turno abierto.
  const [offStreetParkings, setOffStreetParkings] = useState([]);
  const [selectedOffStreetParkingId, setSelectedOffStreetParkingId] = useState("");
  const [offStreetSelectionError, setOffStreetSelectionError] = useState("");
  const [lastClosedParking, setLastClosedParking] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const operationBusyRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState(POS_VIEWS.HOME);
  const [error, setError] = useState("");
  const [context, setContext] = useState(null);
  const [parking, setParking] = useState(null);
  const [vehiclesInside, setVehiclesInside] = useState(0);
  const [activeStays, setActiveStays] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  // SOL-2026-10-08-003: confirmación de "se retiró sin pagar" y resumen del cierre.
  const [unpaidFlash, setUnpaidFlash] = useState("");
  const [closedUnpaidExits, setClosedUnpaidExits] = useState(null);
  const [selectedVehicleLoading, setSelectedVehicleLoading] = useState(false);
  const [selectedVehicleError, setSelectedVehicleError] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState("MENU");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentResult, setPaymentResult] = useState(null);
  // Pago con tarjeta (TUU DEV): estado propio del paso "CARD_PAYMENT" --
  // PROCESSING/APPROVED son transitorios (llevan directo a PRINT_PROMPT o al
  // cierre del flujo, igual que EFECTIVO); DECLINED/CANCELLED/NOT_INSTALLED/
  // ERROR es terminal y se muestra en el modal. Un pago aprobado pendiente de
  // registro o un resultado incierto viven en tuuPendingPayments (TUU-02).
  // cardPaymentLockRef es una guarda SÍNCRONA (a diferencia de paymentSubmitting,
  // que es estado de React y no se actualiza al instante) para impedir un
  // doble clic que dispare dos pagos TUU en paralelo.
  const [cardPaymentStatus, setCardPaymentStatus] = useState("");
  const [cardPaymentMessage, setCardPaymentMessage] = useState("");
  // Fase TUU-02: pagos TUU sin cerrar guardados en este equipo (en curso,
  // resultado incierto o aprobados pendientes de registro en ParkFacil).
  const [tuuPendingPayments, setTuuPendingPayments] = useState([]);
  const [tuuPendingBusy, setTuuPendingBusy] = useState(false);
  const [tuuPendingMessage, setTuuPendingMessage] = useState("");
  const [tuuPendingViewStayId, setTuuPendingViewStayId] = useState(null);
  const [tuuPendingNotice, setTuuPendingNotice] = useState("");
  // Intentos activos según el servidor (fuente de verdad, incluye los
  // iniciados en otros equipos del mismo estacionamiento).
  const [serverCardAttempts, setServerCardAttempts] = useState([]);
  const cardPaymentLockRef = useRef(false);
  const refreshServerCardAttemptsRef = useRef(null);
  const syncNativeTuuStateRef = useRef(null);
  const nativeTuuResultsBusyRef = useRef(new Set());
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryPlate, setEntryPlate] = useState("");
  // Fase 2 — Entrada V2: PLATE (capturar/escribir) -> CONFIRM (confirmar
  // o corregir, obligatorio) -> PHOTO (solo si la foto no está DISABLED) ->
  // registro. entryConfirmedPlate es la ÚNICA llave para registrar: se fija
  // al tocar CONFIRMAR (y se pasa explícitamente a submitEntry cuando la
  // foto está DISABLED, sin esperar un render); submitEntry se niega a
  // enviar otra patente distinta -- ni el OCR ni la voz registran solos.
  const [entryStep, setEntryStep] = useState("PLATE");
  const [entryPlateSource, setEntryPlateSource] = useState(PLATE_SOURCES.MANUAL);
  const [entryProposalNotice, setEntryProposalNotice] = useState("");
  const [entryErrorCode, setEntryErrorCode] = useState("");
  const [entryConfirmedPlate, setEntryConfirmedPlate] = useState("");
  // Guarda SÍNCRONA contra doble toque/latencia (entrySubmitting es estado
  // de React y no se actualiza al instante): un segundo toque nunca lanza
  // un segundo POST de ENTRY.
  const entrySubmitLockRef = useRef(false);
  // OCR: la imagen capturada para LEER la patente (temporal, nunca se
  // sube por sí sola). Solo pasa a ser evidencia si el operador elige
  // explícitamente "USAR FOTO DE LA LECTURA" en el paso de fotografía.
  const [ocrCaptureOpen, setOcrCaptureOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPhoto, setOcrPhoto] = useState(null);
  // Voz: IDLE | CHECKING | LISTENING | INSTALLING. voiceInstallLang != null
  // cuando el modelo local se puede descargar (acción del operador).
  const [voiceState, setVoiceState] = useState("IDLE");
  const [voiceInstallLang, setVoiceInstallLang] = useState(null);
  const [voiceController, setVoiceController] = useState(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [entrySuccess, setEntrySuccess] = useState(null);
  const [entryPrintPayload, setEntryPrintPayload] = useState(null);
  const [entryPrintBusy, setEntryPrintBusy] = useState(false);
  const [entryPrintStatus, setEntryPrintStatus] = useState("");
  const [nativePrintAvailable, setNativePrintAvailable] = useState(false);
  // Fase 6 — fotografía de patente: modo/flag configurados por estacionamiento
  // (DISABLED por defecto, ver GET /api/data-entry -> platePhotoSettings).
  // entryPhoto es la foto ya comprimida elegida en el formulario (antes de
  // enviar); entryPhotoForPrint conserva sus bytes tras un ENTRY exitoso,
  // exclusivamente para poder incluirla al imprimir/reimprimir el ticket.
  const [platePhotoMode, setPlatePhotoMode] = useState("DISABLED");
  // Por qué "Tomar foto" no está disponible en el estacionamiento activo
  // (sin configurar / desactivada / no se pudo leer). null = el servidor no
  // lo informa. Solo es informativo: la regla sigue siendo platePhotoMode.
  const [platePhotoStatus, setPlatePhotoStatus] = useState(null);
  const [printPlatePhotoOnTicket, setPrintPlatePhotoOnTicket] = useState(false);
  // Ajuste final: GPS configurable por proyecto, mismo enum DISABLED/
  // OPTIONAL/REQUIRED que platePhotoMode (§18/§19 del encargo) -- nunca se
  // solicita ubicación por esta funcionalidad si viene DISABLED.
  const [platePhotoGpsMode, setPlatePhotoGpsMode] = useState("DISABLED");
  // D2 (SOL-2026-10-18-001): DÉBITO/CRÉDITO solo si el servidor los habilita (apagados en producción).
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState(false);
  // Cupones (SOL-2026-10-19-002): APLICAR CUPÓN solo si el servidor los habilita
  // (apagados en producción). appliedCouponToken = cupón del cálculo vigente.
  const [couponsEnabled, setCouponsEnabled] = useState(false);
  const [appliedCouponToken, setAppliedCouponToken] = useState(null);
  const [couponEntryOpen, setCouponEntryOpen] = useState(false);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState(null);
  const couponRequestRef = useRef(0);
  const couponLockRef = useRef(false);
  const selectedStayIdRef = useRef(null);
  useEffect(() => {
    selectedStayIdRef.current = selectedVehicle?.stay?.id || null;
  }, [selectedVehicle?.stay?.id]);
  const [entryPhoto, setEntryPhoto] = useState(null);
  // Pago liberado: resultado de RELEASED_CHECK para la patente confirmada.
  // Una patente liberada exige foto nueva aunque el estacionamiento tenga la
  // foto desactivada u opcional. CONFIRMAR pasa el resultado recién
  // obtenido a submitEntry para no depender de un estado aún sin actualizar.
  const [entryReleased, setEntryReleased] = useState(null);
  const [releasedExitBusy, setReleasedExitBusy] = useState(false);
  const [photoCaptureOpen, setPhotoCaptureOpen] = useState(false);
  const [entryPhotoForPrint, setEntryPhotoForPrint] = useState(null);
  const [receiptPrintPayload, setReceiptPrintPayload] = useState(null);
  const [receiptPrintBusy, setReceiptPrintBusy] = useState(false);
  const [receiptPrintStatus, setReceiptPrintStatus] = useState("");
  const [paymentsToday, setPaymentsToday] = useState([]);
  const [paymentsTodayTotals, setPaymentsTodayTotals] = useState(null);
  const [paymentsTodayLoading, setPaymentsTodayLoading] = useState(false);
  const [paymentsTodayError, setPaymentsTodayError] = useState("");
  const [paymentsDayPrintBusy, setPaymentsDayPrintBusy] = useState(false);
  const [paymentsDayPrintStatus, setPaymentsDayPrintStatus] = useState("");
  // Recuerda si el listado de vehículos (compartido por VEHÍCULOS EN EL
  // PARKING y SALIDA) se abrió con intención de consulta o de salida/pago,
  // para que VOLVER desde el detalle regrese a la pantalla de origen.
  const [vehicleListOrigin, setVehicleListOrigin] = useState(POS_VIEWS.VEHICULOS);

  // SALIDA: búsqueda por patente (no lista automáticamente todas las
  // permanencias abiertas — eso sigue siendo exclusivo de "Vehículos en el
  // parking"). salidaSearchStatus.type: "not-found" | "conflict" | "invalid".
  const [salidaPlate, setSalidaPlate] = useState("");
  const [salidaSearchStatus, setSalidaSearchStatus] = useState(null);
  const [salidaSuggestionsOpen, setSalidaSuggestionsOpen] = useState(false);
  // Salida por QR: lectura del QR del ticket de entrada -> cotización -> cobro.
  const [qrExitStatus, setQrExitStatus] = useState(null);
  const [qrManualCode, setQrManualCode] = useState("");
  const [qrScanKey, setQrScanKey] = useState(0);
  const [qrBusy, setQrBusy] = useState(false);
  // APK con scanQr de stub (antiguo): se vuelve a la cámara del navegador.
  const [qrNativeUnsupported, setQrNativeUnsupported] = useState(false);
  // BUSCAR TICKET / REIMPRIMIR TICKET: misma vista; "reprint" solo cambia el título.
  const [buscarQuery, setBuscarQuery] = useState("");
  const [buscarIntent, setBuscarIntent] = useState("search");
  const [buscarLoading, setBuscarLoading] = useState(false);

  // CIERRE DE CAJA
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftState, setShiftState] = useState("UNASSIGNED");
  const [shiftStartBusy, setShiftStartBusy] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [shift, setShift] = useState(null);
  const [shiftClosed, setShiftClosed] = useState(false);
  const [shiftClosure, setShiftClosure] = useState(null);
  const [shiftPreview, setShiftPreview] = useState(null);
  const [shiftServerNow, setShiftServerNow] = useState(null);
  const [declaredCashInput, setDeclaredCashInput] = useState("");
  const [differenceObservationInput, setDifferenceObservationInput] = useState("");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [closurePrintPrompt, setClosurePrintPrompt] = useState(false);
  const [closureReceiptPayload, setClosureReceiptPayload] = useState(null);
  const [closureReceiptBusy, setClosureReceiptBusy] = useState(false);
  const [closureReceiptStatus, setClosureReceiptStatus] = useState("");

  // IMPRIMIR VEHÍCULOS EN EL PARKING
  const [listadoPrintPrompt, setListadoPrintPrompt] = useState(false);
  const [listadoPrintPayload, setListadoPrintPayload] = useState(null);
  const [listadoPrintBusy, setListadoPrintBusy] = useState(false);
  const [listadoPrintStatus, setListadoPrintStatus] = useState("");

  const loadTerminalState = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const session = await getSessionContext();
      if (!session.ok) {
        // Fase 1: sesión expirada (401) o cuenta/membresía/empresa ya no
        // habilitada (403) -> nunca se deja al operador en el terminal.
        const reason = posLoginReasonForSessionStatus(session.status, session.payload?.code);
        if (reason) {
          redirectToPosLogin(reason);
          return;
        }
        setError("No fue posible validar la sesión del terminal.");
        return;
      }

      const summary = await getPosVehicleSummary();
      if (!summary.ok) {
        if (summary.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        // Fase 1: varios estacionamientos autorizados y ningún turno que
        // defina cuál se opera -- no es un error: el gate de turno ofrece
        // elegir el turno programado a iniciar (ver loadShiftState).
        if (summary.status === 409 && summary.payload?.code === "PARKING_SELECTION_REQUIRED") {
          setContext(session.payload?.data || null);
          setParking(null);
          setVehiclesInside(0);
          setActiveStays([]);
          setParkingSelectionRequired(true);
          return;
        }
        if (summary.status === 403) {
          setError(summary.payload?.error || "Tu cuenta no tiene permisos operativos POS.");
          return;
        }
        setError(summary.payload?.error || "No fue posible cargar el estacionamiento asignado.");
        return;
      }

  const stays = Array.isArray(summary.payload?.data?.stays) ? summary.payload.data.stays : [];
      setContext(session.payload?.data || null);
      setParking(summary.payload?.data?.parking || null);
      setParkingSelectionRequired(false);
      setVehiclesInside(stays.length);
      setActiveStays(stampStaysReceivedAt(stays));
      const photoSettings = summary.payload?.data?.platePhotoSettings || null;
      setPlatePhotoMode(photoSettings?.mode || "DISABLED");
      setPlatePhotoStatus(photoSettings?.status || null);
      setPrintPlatePhotoOnTicket(Boolean(photoSettings?.printOnTicket));
      setPlatePhotoGpsMode(photoSettings?.gpsMode || "DISABLED");
      setCardPaymentsEnabled(summary.payload?.data?.cardPaymentsEnabled === true);
      setCouponsEnabled(summary.payload?.data?.couponsEnabled === true);
    } catch {
      setError("Error de red al cargar el terminal POS.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadPaymentsToday = useCallback(async () => {
    setPaymentsTodayLoading(true);
    setPaymentsTodayError("");

    try {
      const result = await getPosPaymentsToday();
      if (!result.ok) {
        if (result.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        setPaymentsTodayError(result.payload?.error || "No fue posible cargar los pagos del día.");
        return;
      }

      setPaymentsToday(Array.isArray(result.payload?.data?.payments) ? result.payload.data.payments : []);
      setPaymentsTodayTotals(result.payload?.data?.totals || null);
    } catch {
      setPaymentsTodayError("Error de red al cargar los pagos del día.");
    } finally {
      setPaymentsTodayLoading(false);
    }
  }, []);

  // Abre (si no existe) o recupera el turno POS del operador y trae, según
  // corresponda, la vista previa server-side (turno abierto) o el cierre ya
  // persistido e inmutable (turno cerrado — TURNO CERRADO).
  const loadShiftState = useCallback(async () => {
    setShiftLoading(true);
    setShiftError("");

    try {
      const result = await getPosShift();
      if (!result.ok) {
        if (result.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        setShiftError(result.payload?.error || "No fue posible cargar el turno del operador.");
        return;
      }

      const data = result.payload?.data || {};
      setShiftState(data.state || "UNASSIGNED");
      setShift(data.shift || null);
      setShiftClosed(Boolean(data.closed));
      setShiftClosure(data.closure || null);
      setShiftPreview(data.preview || null);
      setShiftServerNow(data.serverNow || null);
      setParkingOptions(Array.isArray(data.parkingOptions) ? data.parkingOptions : []);
      setOnDemandParkings(Array.isArray(data.onDemandParkings) ? data.onDemandParkings : []);
      const offStreet = Array.isArray(data.offStreetParkings) ? data.offStreetParkings : [];
      setOffStreetParkings(offStreet);
      setSelectedOffStreetParkingId((current) => (offStreet.some((option) => option.parkingId === current) ? current : ""));
      // Sin estacionamiento activo (selector) el último cierre de hoy sigue
      // disponible para consulta y reimpresión.
      if (data.state === "PARKING_SELECTION_REQUIRED" && data.lastClosure?.closure) {
        setShift(data.lastClosure.shift || null);
        setShiftClosed(true);
        setShiftClosure(data.lastClosure.closure);
        setLastClosedParking(data.lastClosure.parking || null);
      }
    } catch {
      setShiftError("Error de red al cargar el turno del operador.");
    } finally {
      setShiftLoading(false);
    }
  }, []);

  // selectedShiftId: solo en la selección explícita de estacionamiento
  // (PARKING_SELECTION_REQUIRED). El servidor lo valida contra los turnos
  // programados que él mismo calculó -- nunca se envía un parkingId.
  async function startProgrammedShift(selectedShiftId = null) {
    const targetShiftId = selectedShiftId || shift?.id;
    if (!targetShiftId || shiftStartBusy) return;
    setShiftStartBusy(true);
    setShiftError("");
    try {
      const result = await postStartShift(targetShiftId);
      if (!result.ok) {
        if (result.status === 401) redirectToPosLogin("sesion-expirada");
        else setShiftError(result.payload?.error || "No fue posible iniciar el turno.");
        return;
      }
      await loadShiftState();
      await loadTerminalState(true);
    } catch {
      setShiftError("Error de red al iniciar el turno.");
    } finally {
      setShiftStartBusy(false);
    }
  }

  // Selector Off Street: inicia el turno en el estacionamiento elegido en el
  // pulldown. El servidor valida el id contra los Off Street activos de la
  // empresa y rechaza si ya existe otro turno abierto.
  function startSelectedOffStreetShift() {
    if (!selectedOffStreetParkingId) {
      setOffStreetSelectionError("Elige un estacionamiento para iniciar el turno.");
      return;
    }
    setOffStreetSelectionError("");
    void startOnDemandShift(selectedOffStreetParkingId);
  }

  // Inicio de turno a pedido: mismo flujo de refresco que un turno programado.
  async function startOnDemandShift(parkingId = null) {
    if (shiftStartBusy) return;
    setShiftStartBusy(true);
    setShiftError("");
    try {
      const result = await postStartOnDemandShift(parkingId);
      if (!result.ok) {
        if (result.status === 401) redirectToPosLogin("sesion-expirada");
        else setShiftError(result.payload?.error || "No fue posible iniciar el turno.");
        return;
      }
      await loadShiftState();
      await loadTerminalState(true);
    } catch {
      setShiftError("Error de red al iniciar el turno.");
    } finally {
      setShiftStartBusy(false);
    }
  }

  // Fase 1: el cierre de sesión nunca queda a medias. Antes, si
  // supabase.auth.signOut() fallaba (p. ej. sin red), la excepción cortaba
  // la función y el operador seguía dentro del terminal con la cookie de
  // sesión intacta. Ahora cada paso es best-effort y la salida al login
  // ocurre siempre. No se permite salir con un cobro con tarjeta en curso
  // (TUU ya puede estar cobrando): paymentSubmitting permanece en true
  // durante todo handleCardPaymentSelection, incluido el registro del EXIT.
  async function logout() {
    if (loggingOut || paymentSubmitting) return;
    setLoggingOut(true);
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } catch {
      // Se continúa igual: la cookie httpOnly se invalida abajo.
    }
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    redirectToPosLogin("sesion-cerrada");
  }

  function openSidebar() {
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function goToSection(section) {
    setCurrentView(section);
    setSidebarOpen(false);

    if (section === POS_VIEWS.QR) {
      // Cada entrada a Salida por QR parte con el lector nuevo y sin mensajes;
      // con escáner nativo (APK) se abre de inmediato.
      setQrExitStatus(null);
      setQrManualCode("");
      setQrScanKey((value) => value + 1);
      if (shiftReadyForOperations && usesNativeQrScanner()) void startNativeQrScan();
    }

    if (section === POS_VIEWS.BUSCAR) setBuscarQuery("");

    if (section !== POS_VIEWS.VEHICULO_DETALLE) {
      setSelectedVehicle(null);
      setSelectedVehicleLoading(false);
      setSelectedVehicleError("");
      setPaymentModalOpen(false);
      setPaymentStep("MENU");
      setPaymentSubmitting(false);
      setPaymentMessage("");
      setPaymentResult(null);
    }

    if (section !== POS_VIEWS.INGRESO) {
      // Fase 2: salir de INGRESO corta la escucha de voz y descarta la
      // captura V2 en curso (nada se registra).
      if (entryOpen) resetEntryCapture();
      setEntryOpen(false);
      setEntryError("");
      setEntrySuccess(null);
      setEntryPrintStatus("");
    }

    if (section === POS_VIEWS.PAGOS_DEL_DIA) {
      setPaymentsDayPrintStatus("");
      void loadPaymentsToday();
    }

    if (section === POS_VIEWS.PAGOS_POR_RESOLVER) {
      setTuuPendingViewStayId(null);
      setTuuPendingMessage("");
      void refreshServerCardAttempts();
    }

    if (section === POS_VIEWS.VEHICULOS || section === POS_VIEWS.SALIDA) {
      setVehicleListOrigin(section);
    }

    if (section === POS_VIEWS.SALIDA) {
      // Refresca activeStays al entrar para que la búsqueda por patente
      // corra contra datos frescos (mismo alcance ya limitado al
      // estacionamiento asignado — ver loadTerminalState).
      void loadTerminalState(true);
    } else {
      setSalidaPlate("");
      setSalidaSearchStatus(null);
      setSalidaSuggestionsOpen(false);
    }

    if (section === POS_VIEWS.CIERRE_CAJA) {
      void loadShiftState();
    } else {
      setCloseConfirmOpen(false);
      setCloseError("");
      setClosurePrintPrompt(false);
      setClosureReceiptPayload(null);
      setClosureReceiptStatus("");
    }

    if (section !== POS_VIEWS.IMPRIMIR_LISTADO) {
      setListadoPrintPrompt(false);
      setListadoPrintPayload(null);
      setListadoPrintStatus("");
    }
  }

  // Fase 2: estado de la captura V2 limpio (se usa al abrir y al cerrar el
  // formulario). Libera los object URLs de las imágenes temporales.
  function setEntryReleasedState(value) {
    setEntryReleased(value);
  }

  function resetEntryCapture() {
    setEntryReleasedState(null);
    voiceController?.cancel();
    setVoiceController(null);
    if (ocrPhoto?.previewUrl) URL.revokeObjectURL(ocrPhoto.previewUrl);
    if (entryPhoto?.previewUrl && entryPhoto !== ocrPhoto) URL.revokeObjectURL(entryPhoto.previewUrl);
    setEntryConfirmedPlate("");
    setEntryStep("PLATE");
    setEntryPlateSource(PLATE_SOURCES.MANUAL);
    setEntryProposalNotice("");
    setEntryErrorCode("");
    setOcrCaptureOpen(false);
    setOcrBusy(false);
    setOcrPhoto(null);
    setVoiceState("IDLE");
    setVoiceInstallLang(null);
  }

  function openEntryForm() {
    resetEntryCapture();
    setCurrentView(POS_VIEWS.INGRESO);
    setEntrySuccess(null);
    setEntryPrintPayload(null);
    setEntryPrintStatus("");
    setEntryError("");
    setEntryPlate("");
    setEntryPhoto(null);
    setEntryPhotoForPrint(null);
    setPhotoCaptureOpen(false);
    setEntryOpen(true);
    setSidebarOpen(false);
  }

  function closeEntryForm() {
    resetEntryCapture();
    setEntryOpen(false);
    setEntryError("");
    setEntrySuccess(null);
    setEntryPrintStatus("");
    setEntryPhoto(null);
    setEntryPhotoForPrint(null);
    setPhotoCaptureOpen(false);
    setCurrentView(POS_VIEWS.HOME);
  }

  function capturedPlatePhoto(photo) {
    // Libera el object URL de una captura anterior (p. ej. "Cambiar foto")
    // antes de reemplazarla -- evita acumular blobs sin liberar durante un
    // turno largo de POS. La imagen de la lectura OCR se conserva (puede
    // volver a elegirse) y se libera al cerrar el formulario.
    if (entryPhoto?.previewUrl && entryPhoto !== ocrPhoto) URL.revokeObjectURL(entryPhoto.previewUrl);
    setEntryPhoto(photo);
    setPhotoCaptureOpen(false);
    setEntryError("");
  }

  // detail: diagnóstico técnico opcional (p. ej. por qué no cargó el OCR).
  function setEntryFailure(code, detail = "") {
    setEntryErrorCode(code);
    setEntryError(detail ? `${entryErrorMessage(code)} (Detalle: ${detail})` : entryErrorMessage(code));
  }

  function clearEntryFailure() {
    setEntryErrorCode("");
    setEntryError("");
  }

  // Toda patente propuesta (manual, OCR o voz) pasa SIEMPRE por la
  // confirmación explícita del operador. Nunca registra.
  function proposeEntryPlate(plate, source, notice = "") {
    setEntryReleasedState(null);
    setEntryConfirmedPlate("");
    setEntryPlate(formatPosPlateInput(plate));
    setEntryPlateSource(source);
    setEntryProposalNotice(notice);
    clearEntryFailure();
    setEntryStep("CONFIRM");
  }

  function continueManualPlate() {
    const formatted = formatPosPlateInput(entryPlate);
    if (!POS_PLATE_REGEX.test(formatted)) {
      setEntryFailure("INVALID_PLATE");
      return;
    }
    // En el paso PLATE la patente siempre es manual: OCR y voz proponen y
    // saltan directo a CONFIRM.
    proposeEntryPlate(formatted, PLATE_SOURCES.MANUAL);
  }

  // CORREGIR: vuelve al campo con la patente propuesta para editarla; nada
  // se registra. Desde aquí la patente pasa a ser manual.
  function correctEntryPlate() {
    setEntryReleasedState(null);
    setEntryConfirmedPlate("");
    setEntryPlateSource(PLATE_SOURCES.MANUAL);
    setEntryProposalNotice("");
    clearEntryFailure();
    setEntryStep("PLATE");
  }

  // CONFIRMAR: fija la patente confirmada. Con foto DISABLED registra de
  // inmediato; si no, pasa al paso de fotografía (REQUIRED u OPTIONAL).
  async function checkReleasedPlate(plate) {
    try {
      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: { "content-type": "application/json", "x-parkfacil-portal": "terminal" },
        cache: "no-store",
        body: JSON.stringify({ action: "RELEASED_CHECK", plate }),
      });
      if (response.status === 401) {
        redirectToPosLogin("sesion-expirada");
        return null;
      }
      const payload = await response.json().catch(() => ({}));
      return response.ok ? payload?.data || null : null;
    } catch {
      // Sin respuesta: el servidor vuelve a evaluar la patente al registrar.
      return null;
    }
  }

  async function confirmEntryPlate() {
    if (entrySubmitting || entrySubmitLockRef.current) return;
    const formatted = formatPosPlateInput(entryPlate);
    if (!POS_PLATE_REGEX.test(formatted)) {
      correctEntryPlate();
      setEntryFailure("INVALID_PLATE");
      return;
    }
    const confirmedPlate = toBackendPlate(formatted);
    clearEntryFailure();
    // Pago liberado: la patente se valida al confirmar. Si tiene
    // autorización pero el beneficio no aplica (módulo desactivado, sin
    // vigencia o sin cupo), el operador lo ve y confirma de nuevo para
    // ingresar con cobro normal.
    const previous = entryReleased;
    let released = previous?.plate === confirmedPlate ? previous : null;
    if (!released) {
      entrySubmitLockRef.current = true;
      setEntrySubmitting(true);
      released = await checkReleasedPlate(confirmedPlate);
      entrySubmitLockRef.current = false;
      setEntrySubmitting(false);
      setEntryReleasedState(released ? { ...released, plate: confirmedPlate, acknowledged: false } : null);
      if (released && !released.released && released.decision !== "NOT_AUTHORIZED") return;
    } else if (!released.released && released.decision !== "NOT_AUTHORIZED" && !released.acknowledged) {
      setEntryReleasedState({ ...released, acknowledged: true });
    }
    setEntryConfirmedPlate(confirmedPlate);
    const photoMode = released?.released ? "REQUIRED" : platePhotoMode;
    // Foto ya tomada en el paso Patente ("Tomar foto"): registra directo, sin
    // volver a pedirla.
    if (entryPhoto && photoMode !== "DISABLED") {
      void submitEntry(null, confirmedPlate, released);
      return;
    }
    if (photoMode === "DISABLED") {
      void submitEntry(null, confirmedPlate, released);
      return;
    }
    setEntryStep("PHOTO");
  }

  // OCR (cámara): misma cámara/encuadre/recorte que la evidencia, pero la
  // imagen es TEMPORAL -- solo sirve para leer la patente. GPS nunca
  // bloquea la lectura (REQUIRED se trata como OPTIONAL aquí; si la foto se
  // reutiliza como evidencia se vuelve a exigir abajo).
  async function handleOcrCapture(photo) {
    setOcrCaptureOpen(false);
    if (ocrPhoto?.previewUrl && ocrPhoto !== entryPhoto) URL.revokeObjectURL(ocrPhoto.previewUrl);
    setOcrPhoto(photo);
    setOcrBusy(true);
    clearEntryFailure();
    try {
      const result = await recognizePlate(photo.base64);
      if (!result.ok) {
        setEntryFailure(result.code, result.detail || "");
        return;
      }
      const confidence = Number.isFinite(result.proposal?.confidence) ? ` (confianza ${Math.round(result.proposal.confidence)}%)` : "";
      proposeEntryPlate(
        result.proposal.plate,
        PLATE_SOURCES.OCR,
        result.proposal.lowConfidence ? entryErrorMessage("OCR_LOW_CONFIDENCE") : `Leída con la cámara${confidence}. Verifica antes de confirmar.`
      );
    } finally {
      setOcrBusy(false);
    }
  }

  // Voz: solo reconocimiento EN EL DISPOSITIVO (ver plateVoice.js). Nunca
  // escucha permanentemente: una frase, con tope de tiempo y botón Cancelar.
  async function startVoiceCapture() {
    if (voiceState !== "IDLE") return;
    clearEntryFailure();
    setVoiceState("CHECKING");
    const support = await detectLocalVoiceSupport();
    if (support.status === "DOWNLOADABLE") {
      setVoiceInstallLang(support.lang);
      setVoiceState("IDLE");
      setEntryFailure("VOICE_LOCAL_UNAVAILABLE");
      return;
    }
    if (support.status !== "AVAILABLE") {
      setVoiceState("IDLE");
      setEntryFailure(support.status === "UNSUPPORTED" ? "VOICE_UNSUPPORTED" : "VOICE_LOCAL_UNAVAILABLE");
      return;
    }
    setVoiceState("LISTENING");
    let finishedSynchronously = false;
    const controller = listenForPlate({
      lang: support.lang,
      onDone: (outcome) => {
        finishedSynchronously = true;
        setVoiceController(null);
        setVoiceState("IDLE");
        if (outcome.ok) {
          proposeEntryPlate(outcome.plate, PLATE_SOURCES.VOICE, `Dictado: "${outcome.transcript}". Verifica antes de confirmar.`);
        } else {
          setEntryFailure(outcome.code);
        }
      },
    });
    // Si el micrófono falló al arrancar, onDone ya corrió: no queda nada
    // que cancelar.
    if (!finishedSynchronously) setVoiceController(controller);
  }

  function cancelVoiceCapture() {
    voiceController?.cancel();
    setVoiceController(null);
    setVoiceState("IDLE");
  }

  async function installVoiceModel() {
    if (!voiceInstallLang || voiceState !== "IDLE") return;
    setVoiceState("INSTALLING");
    const installed = await installLocalVoice(voiceInstallLang);
    setVoiceState("IDLE");
    if (installed) {
      setVoiceInstallLang(null);
      clearEntryFailure();
    } else {
      setEntryFailure("VOICE_LOCAL_UNAVAILABLE");
    }
  }

  // Un solo <form> para toda la captura: Enter/submit avanza según el paso
  // (PLATE -> CONFIRM -> registrar). El registro real sigue siendo
  // exclusivamente submitEntry.
  function handleEntryFormSubmit(event) {
    event.preventDefault();
    if (entryStep === "PLATE") {
      continueManualPlate();
      return;
    }
    if (entryStep === "CONFIRM") {
      confirmEntryPlate();
      return;
    }
    void submitEntry(event);
  }

  // Búsqueda por patente exclusiva de SALIDA. Nunca llama a una API nueva:
  // filtra activeStays, que ya viene acotado al estacionamiento asignado al
  // operador (mismo alcance/aislamiento que ya usa "Vehículos en el
  // parking" — ver loadTerminalState/getPosVehicleSummary). La
  // normalización reutiliza toBackendPlate/formatPosPlateInput/
  // POS_PLATE_REGEX, las mismas que ya usa el formulario de INGRESO — sin
  // segunda lógica paralela.
  function searchSalidaPlate() {
    const formatted = formatPosPlateInput(salidaPlate);
    if (!POS_PLATE_REGEX.test(formatted)) {
      setSalidaSearchStatus({ type: "invalid", message: "Ingresa una patente válida. Ejemplo: CXPY-93." });
      return;
    }

    const query = toBackendPlate(formatted);
    const matches = activeStays.filter((stay) => toBackendPlate(stay?.license_plate) === query);

    if (matches.length === 0) {
      setSalidaSearchStatus({
        type: "not-found",
        message: "No se encontró un vehículo activo con esa patente en este estacionamiento.",
      });
      return;
    }

    if (matches.length > 1) {
      // Anomalía real (más de una permanencia OPEN con la misma patente):
      // nunca se elige una silenciosamente ni se continúa hacia el cobro.
      setSalidaSearchStatus({
        type: "conflict",
        message: `Se encontraron ${matches.length} permanencias abiertas con esta patente. No se puede continuar automáticamente — contacta a soporte antes de cobrar.`,
      });
      return;
    }

    setSalidaSearchStatus(null);
    void openVehicleDetail(matches[0]);
  }

  // Sugerencias en vivo para el desplegable de SALIDA: mismo filtro de
  // activeStays que searchSalidaPlate (sin fetch nuevo), pero con
  // startsWith en vez de igualdad exacta, para que se vayan acotando a
  // medida que se escribe cada letra. Vacío mientras no haya texto.
  const salidaSuggestions = (() => {
    const query = toBackendPlate(salidaPlate);
    if (!query) return [];
    return activeStays
      .filter((stay) => toBackendPlate(stay?.license_plate).startsWith(query))
      .slice(0, 8);
  })();

  function selectSalidaSuggestion(stay) {
    setSalidaPlate(formatPosPlateInput(stay?.license_plate));
    setSalidaSearchStatus(null);
    setSalidaSuggestionsOpen(false);
    void openVehicleDetail(stay);
  }

  // Devuelve el detalle cotizado (o null) -- lo usa Salida por QR para abrir el cobro.
  async function openVehicleDetail(stay) {
    if (!stay?.id) return null;
    setCurrentView(POS_VIEWS.VEHICULO_DETALLE);
    setSidebarOpen(false);
    setSelectedVehicleLoading(true);
    setSelectedVehicleError("");
    setPaymentModalOpen(false);
    setPaymentStep("MENU");
    setPaymentSubmitting(false);
    setPaymentMessage("");
    setPaymentResult(null);
    selectedStayIdRef.current = stay.id;
    setSelectedVehicle({ stay, quote: stay.quote || null, parking: parking || null, serverNow: stay.serverNow || null });
    resetCouponEntry();

    // Respuesta tardía de otro vehículo (se cambió de patente mientras se cotizaba): se descarta.
    const stillSelected = () => selectedStayIdRef.current === stay.id;
    try {
      const response = await getPosVehicleQuote(stay.id);
      if (!stillSelected()) return null;
      if (!response.ok) {
        if (response.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        setSelectedVehicleError(response.payload?.error || "No fue posible actualizar el monto a pagar del vehículo.");
        return;
      }

      const detail = response.payload?.data || null;
      setSelectedVehicle(detail);
      return detail;
    } catch {
      if (stillSelected()) setSelectedVehicleError("Error de red al calcular el cobro del vehículo.");
    } finally {
      if (stillSelected()) setSelectedVehicleLoading(false);
    }
  }

  // Salida por QR: siempre con la lista fresca de estadías OPEN del servidor
  // (el ticket pudo emitirse en otro equipo), mismo resolvedor para el QR
  // leído y para el código escrito a mano. Con la estadía ubicada, cotiza y
  // abre directo el cobro cuando la cotización quedó cargada.
  async function handleQrTicket(raw) {
    if (qrBusy) return;
    if (isCouponQrPayload(raw)) {
      setQrExitStatus({ type: "info", message: COUPON_IN_TICKET_SCAN_MESSAGE });
      return;
    }
    setQrBusy(true);
    setQrExitStatus(null);
    try {
      const summary = await getPosVehicleSummary();
      if (!summary.ok) {
        if (summary.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        setQrExitStatus({ type: "error", message: summary.payload?.error || "No fue posible consultar los vehículos dentro." });
        return;
      }
      const stays = Array.isArray(summary.payload?.data?.stays) ? summary.payload.data.stays : [];
      setActiveStays(stampStaysReceivedAt(stays));
      setVehiclesInside(stays.length);
      const result = resolveStayFromQr(stays, raw);
      if (result.status !== QR_EXIT_STATUS.FOUND) {
        setQrExitStatus({ type: result.status === QR_EXIT_STATUS.CONFLICT ? "conflict" : "error", message: qrExitMessage(result) });
        return;
      }
      setQrManualCode("");
      const detail = await openVehicleDetail(result.stay);
      if (detail) openPaymentModal();
    } catch {
      setQrExitStatus({ type: "error", message: "Error de red al buscar el ticket." });
    } finally {
      setQrBusy(false);
    }
  }

  function restartQrScan() {
    setQrExitStatus(null);
    setQrScanKey((value) => value + 1);
  }

  // TUU PRO2: el QR se lee con la cámara nativa del APK (la del WebView 83
  // cerraba la app). El texto leído sigue el mismo camino que el lector web.
  async function startNativeQrScan() {
    setQrExitStatus(null);
    const result = await scanQrWithNativeScanner(window);
    if (result.ok) {
      await handleQrTicket(result.value);
      return;
    }
    if (result.unsupported) {
      setQrNativeUnsupported(true);
      return;
    }
    if (result.cancelled) {
      setQrExitStatus({ type: "info", message: "Lectura cancelada. Pulsa ESCANEAR QR DEL TICKET para intentar de nuevo." });
      return;
    }
    setQrExitStatus({ type: "error", message: "No fue posible abrir el escáner de QR. Escribe el código del ticket." });
  }

  // BUSCAR / REIMPRIMIR TICKET: abre la vista con la lista fresca de
  // estadías OPEN del estacionamiento (el ticket pudo emitirse en otro equipo).
  function openBuscar(intent) {
    setBuscarIntent(intent);
    goToSection(POS_VIEWS.BUSCAR);
    void refreshActiveStaysForBuscar();
  }

  async function refreshActiveStaysForBuscar() {
    setBuscarLoading(true);
    try {
      const summary = await getPosVehicleSummary();
      if (summary.status === 401) {
        redirectToPosLogin("sesion-expirada");
        return;
      }
      if (!summary.ok) return;
      const stays = Array.isArray(summary.payload?.data?.stays) ? summary.payload.data.stays : [];
      setActiveStays(stampStaysReceivedAt(stays));
      setVehiclesInside(stays.length);
    } catch {
      // Sin red: se busca en la última lista cargada.
    } finally {
      setBuscarLoading(false);
    }
  }

  // Reimprime el ticket de ENTRADA de la estadía elegida, armado con los
  // mismos datos que el ingreso (buildEntryPrintPayload). photoBase64 "" (no
  // null): nunca debe usarse la foto del último ingreso en otro ticket.
  function reprintStayTicket(stay) {
    const payload = buildEntryPrintPayload(stay, parking);
    if (!payload) {
      setEntryPrintStatus("No fue posible armar el ticket de este vehículo.");
      return;
    }
    void printLastEntryTicket(payload, { photoBase64: "" });
  }

  function usesNativeQrScanner() {
    return typeof window !== "undefined" && hasNativeQrScanner(window) && !qrNativeUnsupported;
  }

  function resetCouponEntry() {
    // Cambio de vehículo o detalle reabierto: las respuestas pendientes del
    // cupón anterior quedan descartadas (ver runCouponRequest).
    couponRequestRef.current += 1;
    couponLockRef.current = false;
    setAppliedCouponToken(null);
    setCouponEntryOpen(false);
    setCouponCodeInput("");
    setCouponBusy(false);
    setCouponMessage(null);
  }

  // Leer QR Descuento (SOL-2026-10-19-002): una sola lectura o consulta a la vez
  // por estadía (couponLockRef evita el doble toque y el QR leído dos veces) y
  // solo se usa la respuesta de la última solicitud de la estadía que sigue
  // seleccionada. Mientras tanto PAGAR queda bloqueado (couponBusy).
  async function runCouponRequest(work) {
    const stayId = selectedVehicle?.stay?.id;
    if (!stayId || couponLockRef.current) return;
    couponLockRef.current = true;
    couponRequestRef.current += 1;
    const requestId = couponRequestRef.current;
    const isCurrent = () => couponRequestRef.current === requestId && selectedStayIdRef.current === stayId;
    setCouponBusy(true);
    setCouponMessage(null);
    try {
      await work({ stayId, isCurrent });
    } finally {
      if (couponRequestRef.current === requestId) {
        couponLockRef.current = false;
        setCouponBusy(false);
      }
    }
  }

  // El servidor valida el cupón y devuelve un cálculo firmado nuevo con subtotal,
  // descuento y total; un cupón nuevo reemplaza al anterior (no se acumulan). Si
  // falla, se conserva el último cálculo válido. El cupón se canjea recién al
  // registrar el pago (efectivo o tarjeta).
  async function quoteWithCoupon(stayId, couponToken, isCurrent) {
    const replacing = Boolean(appliedCouponToken);
    try {
      const response = await getPosVehicleQuote(stayId, couponToken);
      if (!isCurrent()) return;
      if (response.status === 401) {
        redirectToPosLogin("sesion-expirada");
        return;
      }
      if (!response.ok || response.payload?.data?.stay?.id !== stayId) {
        const reason = response.payload?.error || "No fue posible aplicar el cupón.";
        setCouponMessage({ type: "error", text: replacing ? `${reason} Se mantiene el cupón anterior.` : reason });
        return;
      }
      setSelectedVehicle(response.payload.data);
      setAppliedCouponToken(couponToken);
      setCouponEntryOpen(false);
      setCouponCodeInput("");
      setPaymentStep("MENU");
      setPaymentMessage("");
      setCouponMessage({ type: "success", text: replacing ? "Cupón reemplazado. Revisa el nuevo total antes de cobrar." : "Cupón aplicado. Revisa el nuevo total antes de cobrar." });
    } catch {
      if (isCurrent()) setCouponMessage({ type: "error", text: "Error de red al validar el cupón. Revisa la conexión y vuelve a intentar." });
    }
  }

  function applyCouponCode(raw) {
    const couponToken = couponTokenForRequest(raw);
    if (!couponToken) {
      setCouponMessage({ type: "error", text: "El código no corresponde a un cupón. Revisa el código de 4 caracteres impreso en el cupón." });
      return;
    }
    if (couponToken === appliedCouponToken) {
      setCouponMessage({ type: "info", text: DISCOUNT_SCAN_MESSAGES.alreadyApplied });
      return;
    }
    void runCouponRequest(({ stayId, isCurrent }) => quoteWithCoupon(stayId, couponToken, isCurrent));
  }

  function removeCoupon() {
    void runCouponRequest(async ({ stayId, isCurrent }) => {
      try {
        const response = await getPosVehicleQuote(stayId);
        if (!isCurrent()) return;
        if (response.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        if (response.ok && response.payload?.data?.stay?.id === stayId) {
          setSelectedVehicle(response.payload.data);
          setAppliedCouponToken(null);
          setPaymentStep("MENU");
          setCouponMessage({ type: "info", text: "Cupón quitado. El total volvió a calcularse sin descuento." });
        } else {
          setCouponMessage({ type: "error", text: response.payload?.error || "No fue posible quitar el cupón." });
        }
      } catch {
        if (isCurrent()) setCouponMessage({ type: "error", text: "Error de red al quitar el cupón. Vuelve a intentar." });
      }
    });
  }

  // Mismo escáner nativo del APK que el QR del ticket (la cámara se cierra al
  // terminar la lectura); sin él, se escribe el código. Solo el QR del cupón se
  // consulta al servidor: el del ticket o uno ajeno se explican sin consultar.
  function scanCouponQr() {
    void runCouponRequest(async ({ stayId, isCurrent }) => {
      const result = await scanQrWithNativeScanner(window, { purpose: "coupon" });
      if (!isCurrent()) return;
      if (!result.ok) {
        if (result.unsupported) setQrNativeUnsupported(true);
        setCouponMessage(discountScanFailureMessage(result));
        if (!result.cancelled) setCouponEntryOpen(true);
        return;
      }
      const scanned = classifyDiscountScan(result.value);
      if (scanned.kind !== "coupon") {
        setCouponMessage({ type: "error", text: DISCOUNT_SCAN_MESSAGES[scanned.kind] });
        return;
      }
      if (scanned.token === appliedCouponToken) {
        setCouponMessage({ type: "info", text: DISCOUNT_SCAN_MESSAGES.alreadyApplied });
        return;
      }
      await quoteWithCoupon(stayId, scanned.token, isCurrent);
    });
  }

  function openPaymentModal() {
    setPaymentModalOpen(true);
    setPaymentStep("MENU");
    setPaymentMessage("");
    setPaymentResult(null);
  }

  function closePaymentModal() {
    setPaymentModalOpen(false);
    setPaymentStep("MENU");
    setPaymentSubmitting(false);
    setPaymentMessage("");
    setPaymentResult(null);
    setReceiptPrintPayload(null);
    setReceiptPrintStatus("");
    setCardPaymentStatus("");
    setCardPaymentMessage("");
  }

  // Obtiene una cotización nueva (misma llamada que ya usa el rechazo
  // server-side QUOTE_SNAPSHOT_EXPIRED), actualiza el vehículo seleccionado
  // y exige una nueva confirmación explícita del operador — nunca cobra ni
  // sustituye el importe en silencio. Se usa tanto si la cotización llegó
  // vencida al cliente como si el servidor la rechaza por vencida.
  async function refreshExpiredQuote(reasonPrefix, { targetStep = "CASH_CONFIRM" } = {}) {
    let refreshedQuote = await getPosVehicleQuote(selectedVehicle.stay.id, appliedCouponToken);
    // El cupón dejó de ser válido (usado, vencido): se recalcula sin él y se avisa.
    if (appliedCouponToken && !refreshedQuote.ok && String(refreshedQuote.payload?.code || "").startsWith("COUPON_")) {
      setAppliedCouponToken(null);
      setCouponMessage({ type: "error", text: `${refreshedQuote.payload?.error || "El cupón ya no es válido."} Se quitó el cupón.` });
      refreshedQuote = await getPosVehicleQuote(selectedVehicle.stay.id);
    }
    if (refreshedQuote.ok && refreshedQuote.payload?.data) {
      const detail = refreshedQuote.payload.data;
      setSelectedVehicle(detail);
      const refreshedAmount = normalizeQuoteView(detail?.quote)?.total ?? 0;
      setPaymentStep(targetStep);
      setPaymentMessage(`${reasonPrefix} Nuevo total: ${formatCurrency(refreshedAmount)}. Confirma nuevamente para cobrar.`);
    } else {
      setPaymentMessage("El cálculo de cobro expiró y no se pudo actualizar automáticamente. Vuelve a abrir el detalle del vehículo.");
    }
  }

  // Pago liberado: salida sin excedente ($0). El servidor recalcula con las
  // condiciones congeladas al ingreso; si hubiera excedente, lo rechaza y el
  // operador cobra con PAGAR.
  async function registerReleasedExit() {
    const stay = selectedVehicle?.stay;
    if (!stay?.id || releasedExitBusy) return;
    setReleasedExitBusy(true);
    setSelectedVehicleError("");
    try {
      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: { "content-type": "application/json", "x-parkfacil-portal": "terminal" },
        cache: "no-store",
        body: JSON.stringify({ action: "RELEASED_EXIT", stayId: stay.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        redirectToPosLogin("sesion-expirada");
        return;
      }
      if (!response.ok) {
        setSelectedVehicleError(payload?.error || "No fue posible registrar la salida.");
        if (payload?.details?.code === "RELEASED_EXCESS_DUE") void openVehicleDetail(stay);
        return;
      }
      setSelectedVehicle(null);
      setVehiclesInside((current) => Math.max(0, current - 1));
      setCurrentView(POS_VIEWS.HOME);
      void loadTerminalState(true);
      void loadPaymentsToday();
    } catch {
      setSelectedVehicleError("Error de red al registrar la salida.");
    } finally {
      setReleasedExitBusy(false);
    }
  }

  async function confirmCashPayment() {
    if (!selectedVehicle?.stay?.id || paymentSubmitting || couponLockRef.current) return;
    const quoteSnapshot = selectedVehicle?.quote?.snapshot || null;

    if (!quoteSnapshot?.signature || isQuoteSnapshotExpired(quoteSnapshot)) {
      setPaymentSubmitting(true);
      setPaymentMessage("");
      try {
        await refreshExpiredQuote("El cálculo de cobro expiró.");
      } finally {
        setPaymentSubmitting(false);
      }
      return;
    }

    setPaymentSubmitting(true);
    setPaymentMessage("");

    try {
      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkfacil-portal": "terminal",
        },
        cache: "no-store",
        body: JSON.stringify({ action: "EXIT", stayId: selectedVehicle.stay.id, paymentMethod: "CASH", quoteSnapshot, ...(appliedCouponToken && quoteSnapshot?.couponId ? { couponToken: appliedCouponToken } : {}) }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Fase 1: con 401 el backend NO registró el pago (la autorización
        // ocurre antes de cualquier escritura) -- se vuelve al login.
        if (response.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        const errorCode = payload?.details?.code || payload?.code || "";
        if (errorCode === "QUOTE_SNAPSHOT_EXPIRED") {
          await refreshExpiredQuote("El cálculo de cobro expiró.");
          return;
        }
        setPaymentMessage(payload?.error || "No fue posible registrar el pago en efectivo.");
        return;
      }

      // A partir de aquí el pago YA quedó registrado y la permanencia YA
      // quedó cerrada en el backend (respuesta 2xx de /api/data-entry). La
      // impresión ocurre automáticamente DESPUÉS de esta confirmación, nunca
      // antes, y una falla de impresión nunca vuelve a tocar el pago ni la
      // permanencia — solo se reutiliza el mismo receiptPrintPayload ya
      // armado con lo que confirmó el backend (ver printLastReceipt).
      const stay = payload?.data?.stay || null;
      const quote = payload?.data?.quote || null;
      const parkingResponse = payload?.data?.parking || parking;
      const amount = Number(quote?.total || 0);
      const boleta = payload?.data?.boleta || null;
      setPaymentResult({
        plate: stay?.license_plate || selectedVehicle.stay.license_plate,
        total: amount,
        paymentMethod: classifiedPaymentMethod(stay) || "CASH",
        boleta,
      });
      const receiptPayload = buildPaymentReceiptPayload(stay, quote, parkingResponse, "CASH", boleta);
      setReceiptPrintPayload(receiptPayload);
      setReceiptPrintStatus("");
      // Igual que en tarjeta: imprimir sin esperar la recarga del terminal.
      const terminalRefresh = loadTerminalState(true);
      const printResult = receiptPayload ? await printLastReceipt(receiptPayload) : null;
      await terminalRefresh;
      const printFailedOnDevice = Boolean(printResult?.attempted && !printResult.ok);

      if (printFailedOnDevice) {
        setPaymentStep("PRINT_PROMPT");
      } else {
        finishPaidFlow();
      }
    } catch {
      setPaymentMessage("Error de red al registrar el pago en efectivo.");
    } finally {
      setPaymentSubmitting(false);
    }
  }

  // Cierra el flujo de pago ya confirmado: no cobra ni cierra permanencia
  // (eso ya ocurrió en confirmCashPayment), solo limpia el estado temporal
  // del modal, refresca Pagos del día y vuelve a HOME.
  function finishPaidFlow() {
    closePaymentModal();
    setSelectedVehicle(null);
    setCurrentView(POS_VIEWS.HOME);
    void loadPaymentsToday();
  }

  function declineReceiptPrint() {
    finishPaidFlow();
  }

  // Invoca el bridge de impresión una sola vez por clic (SÍ / REINTENTAR
  // IMPRESIÓN). Nunca vuelve a llamar a /api/data-entry: reutiliza el
  // recibo ya armado con los datos que confirmó el backend.
  async function confirmReceiptPrint() {
    const result = await printLastReceipt(receiptPrintPayload);
    if (result?.ok) {
      finishPaidFlow();
    }
  }

  function handlePaymentSelection(method) {
    if (couponLockRef.current) return;
    if (method === "CASH") {
      setPaymentStep("CASH_CONFIRM");
      setPaymentMessage("");
    }
  }

  // Pago con tarjeta vía TUU PRO2 (ambiente DEV). tuuMethod distingue
  // DÉBITO(2)/CRÉDITO(1) -- dato real que ya existían como dos botones
  // separados en el MENU, nunca inventado acá (ver TUU_METHOD en
  // src/lib/pos/tuuPayment.mjs).
  //
  // Protección contra doble cobro: cardPaymentLockRef se verifica y fija de
  // forma SÍNCRONA antes de cualquier await -- un segundo clic mientras hay
  // una transacción en curso nunca llega a lanzar un segundo Intent hacia
  // TUU. El candado se libera SOLO en el finally de este función, que cubre
  // tanto el pago TUU como el registro de la salida en el backend (fase
  // posterior al cobro real) -- nunca se libera antes de que ambas partes
  // terminen.
  async function handleCardPaymentSelection(tuuMethod) {
    if (cardPaymentLockRef.current || paymentSubmitting || couponLockRef.current) return;
    if (!selectedVehicle?.stay?.id) return;
    // Total $0 por cupón: salida sin cargo, nunca una transacción de $0 en TUU.
    if (isZeroTotalCouponCharge(selectedVehicle?.quote)) return;

    cardPaymentLockRef.current = true;
    setPaymentSubmitting(true);
    setPaymentMessage("");

    try {
      const stay = selectedVehicle.stay;
      const storage = getTuuPendingStorage();

      // Prevención de segundo cobro (TUU-02): si este ticket ya tiene un pago
      // TUU aprobado pendiente de registro o con resultado incierto, NO se
      // abre TUU. El modal muestra ese pago en lugar de los medios de pago.
      const gate = canStartTuuPayment(loadTuuPendingPayments(storage), stay.id);
      if (!gate.allowed || selectedVehicle?.cardPaymentAttempt) {
        logTuu("SECOND_CHARGE_BLOCKED", gate.record, { status: gate.record?.status || selectedVehicle?.cardPaymentAttempt?.status || null });
        setTuuPendingPayments(loadTuuPendingPayments(storage));
        setPaymentStep("MENU");
        return;
      }

      const quoteSnapshot = selectedVehicle?.quote?.snapshot || null;

      // El cálculo de cobro se valida ANTES de cobrar con TUU (nunca después):
      // una vez que TUU cobra la tarjeta, esa cobranza ya es real y no se
      // puede deshacer desde acá -- por eso este chequeo es más estricto que
      // en EFECTIVO (donde el backend recién cobra al confirmar).
      if (!quoteSnapshot?.signature || isQuoteSnapshotExpired(quoteSnapshot)) {
        await refreshExpiredQuote("El cálculo de cobro expiró.", { targetStep: "MENU" });
        return;
      }

      if (selectedVehicle.cardTypeCaptureAvailable !== true) {
        setPaymentStep("MENU");
        setPaymentMessage("Falta habilitar el registro de Crédito y Débito. No se inició ningún cobro.");
        return;
      }
      const paymentCardType = tuuMethod === TUU_METHOD.CREDIT ? "CREDIT" : tuuMethod === TUU_METHOD.DEBIT ? "DEBIT" : null;
      const amount = normalizeQuoteView(selectedVehicle.quote)?.total;
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        console.error("[pos:tuu]", { event: "INVALID_AMOUNT", stayId: stay.id });
        setPaymentStep("CARD_PAYMENT");
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("No hay un monto a pagar válido. Vuelve a abrir el detalle del vehículo.");
        return;
      }

      setPaymentStep("CARD_PAYMENT");
      setCardPaymentStatus("PROCESSING");
      setCardPaymentMessage("Procesando pago...");

      let tuuPayload;
      try {
        tuuPayload = buildTuuPaymentPayload({ amount, method: tuuMethod });
      } catch (error) {
        console.error("[pos:tuu]", { event: "PAYLOAD_ERROR", stayId: stay.id, message: error instanceof Error ? error.message : String(error) });
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("No fue posible preparar el pago. No se inició ningún cobro.");
        return;
      }

      // --- Reserva central (SOL-2026-10-11-001) ---------------------------
      // 1) El servidor reserva el intento ANTES de abrir TUU. La reserva es
      //    atómica en la base: un solo intento activo por ticket, para todos
      //    los equipos. Sin reserva confirmada (sin conexión, ticket ya
      //    reservado, ambiente sin habilitar) NO se abre TUU.
      const deviceId = getPosDeviceId();
      if (!deviceId) {
        console.error("[pos:tuu]", { event: "DEVICE_ID_UNAVAILABLE", stayId: stay.id });
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("No fue posible identificar este equipo. No se inició ningún cobro.");
        return;
      }
      // APK 0.4.0+: si el equipo guarda un resultado sin confirmar o un intento
      // sin resultado de un pago anterior, primero se informa al servidor. Si
      // aun así el equipo sigue con un pago sin cerrar, la APK no abriría TUU:
      // no se reserva otro intento.
      await syncNativeTuuState({ fromPaymentFlow: true });
      const nativeState = readPendingTuuState(getNativeDeviceBridge());
      if (nativeState.supported && (nativeState.inFlight || nativeState.results.length > 0 || nativeState.readFailed)) {
        console.info("[pos:tuu]", { event: "DEVICE_HAS_OPEN_PAYMENT", stayId: stay.id, inFlight: Boolean(nativeState.inFlight), results: nativeState.results.length, readFailed: nativeState.readFailed === true });
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("Este equipo tiene un pago con tarjeta anterior sin cerrar. Verifica la conexión y vuelve a intentar. No se inició ningún cobro.");
        return;
      }
      const idempotencyKey = newTuuIdempotencyKey();
      // Ambiente que declara la APK (comprobación de compatibilidad; el
      // servidor decide). La APK 0.3.13 no lo declara: solo opera en DEV.
      const tuuEnvironment = readTuuBridgeEnvironment(getNativeDeviceBridge());
      const reservation = await postCardPaymentAction({ action: "CARD_PAYMENT_RESERVE", stayId: stay.id, paymentCardType, quoteSnapshot, idempotencyKey, deviceId, ...(tuuEnvironment ? { tuuEnvironment } : {}) });
      const attempt = reservation.ok ? reservation.payload?.data?.attempt || null : null;
      if (!reservation.ok || !attempt?.id || attempt.status !== "RESERVED") {
        console.info("[pos:tuu]", { event: "RESERVATION_REJECTED", stayId: stay.id, code: reservation.code, status: reservation.status });
        if (reservation.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        if (reservation.code === "CARD_ATTEMPT_ACTIVE") {
          // Otro intento (de este u otro equipo) ya tiene el ticket: se
          // muestra su estado en lugar de los medios de pago.
          await refreshServerCardAttempts();
          setCardPaymentStatus("");
          setCardPaymentMessage("");
          setPaymentStep("MENU");
          setPaymentMessage("Este ticket ya tiene un pago con tarjeta en curso o por resolver. No se inició ningún cobro.");
          return;
        }
        if (["QUOTE_SNAPSHOT_EXPIRED", "QUOTE_SNAPSHOT_STALE", "QUOTE_SNAPSHOT_REQUIRED"].includes(reservation.code)) {
          setCardPaymentStatus("");
          setCardPaymentMessage("");
          await refreshExpiredQuote("El cálculo de cobro expiró.", { targetStep: "MENU" });
          return;
        }
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage(reservation.network
          ? "Sin conexión con ParkFacil: no se pudo reservar el pago. No se inició ningún cobro."
          : `${reservation.payload?.error || "No fue posible reservar el pago."}${/No se inició ningún cobro/.test(reservation.payload?.error || "") ? "" : " No se inició ningún cobro."}`);
        return;
      }

      // 2) Copia de apoyo en el equipo (para reconocer aquí el resultado de
      //    TUU si llega tarde o tras recargar). Si no se puede guardar, se
      //    devuelve la reserva y no se cobra.
      const started = saveTuuPaymentStarted(storage, {
        stayId: stay.id,
        attemptId: attempt.id,
        idempotencyKey,
        deviceId,
        ticketCode: stay.code,
        plate: stay.license_plate,
        parkingId: parking?.id || stay.parking_id,
        parkingName: parking?.name,
        amount: tuuPayload.amount,
        cardType: paymentCardType,
        operatorId: context?.userId,
        operatorName: formatOperatorDisplayName(context),
        shiftId: shift?.id,
      });
      if (!started.ok || !started.record) {
        console.error("[pos:tuu]", { event: "PERSIST_START_FAILED", stayId: stay.id, attemptId: attempt.id });
        await reportTuuAttemptResult({ attemptId: attempt.id, deviceId, stayId: stay.id }, "NOT_STARTED", { errorCode: "LOCAL_STORAGE_FAILED" });
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("No fue posible preparar el pago en este equipo. No se inició ningún cobro.");
        return;
      }
      setTuuPendingPayments(started.records);

      // 3) El servidor debe confirmar SENT_TO_TUU antes de abrir TUU: así una
      //    reserva que nunca llegó a este punto consta como "no se abrió TUU".
      const sent = await postCardPaymentAction({ action: "CARD_PAYMENT_SENT", attemptId: attempt.id, deviceId });
      if (!sent.ok || sent.payload?.data?.attempt?.status !== "SENT_TO_TUU") {
        console.info("[pos:tuu]", { event: "SENT_NOT_CONFIRMED", stayId: stay.id, attemptId: attempt.id, code: sent.code, status: sent.status });
        // TUU no se abrió: se avisa al servidor (o queda en cola) y se quita la copia local.
        await reportTuuAttemptResult(started.record, "NOT_STARTED", { errorCode: "SENT_NOT_CONFIRMED" });
        setTuuPendingPayments(clearTuuPendingPayment(storage, stay.id).records);
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage(sent.network
          ? "Sin conexión con ParkFacil: no se pudo confirmar el pago. No se inició ningún cobro."
          : "No fue posible confirmar el pago con ParkFacil. No se inició ningún cobro.");
        return;
      }

      // 4) Recién ahora se abre TUU.
      logTuu("PAYMENT_START", started.record, { package: TUU_PACKAGE_DEV, method: tuuMethod });
      const outcome = await startTuuPayment(JSON.stringify(tuuPayload), attempt.id);
      const verdict = classifyTuuOutcome(outcome);
      logTuu("PAYMENT_RESULT", started.record, {
        outcome: verdict.outcome,
        errorCode: verdict.code || null,
        errorMessage: outcome?.result?.responseMessage || outcome?.message || null,
        sequenceNumber: outcome?.result?.transactionId || null,
      });
      const tuuError = { errorCode: verdict.code || null, errorMessage: outcome?.result?.responseMessage || outcome?.message || null };

      // Consta que TUU no llegó a abrirse: no hubo cobro.
      if (verdict.outcome === TUU_OUTCOME.NOT_STARTED) {
        await reportTuuAttemptResult(started.record, "NOT_STARTED", tuuError);
        setTuuPendingPayments(clearTuuPendingPayment(storage, stay.id).records);
        if (outcome?.code === "TUU_NOT_INSTALLED" || outcome?.code === "TUU_BRIDGE_UNAVAILABLE") {
          setCardPaymentStatus("NOT_INSTALLED");
          setCardPaymentMessage("TUU no está instalada en este dispositivo. No se inició ningún cobro.");
        } else if (outcome?.code === "TUU_PAYMENT_IN_PROGRESS") {
          setCardPaymentStatus("ERROR");
          setCardPaymentMessage("Este equipo tiene un pago con tarjeta anterior sin cerrar. No se inició ningún cobro.");
        } else if (outcome?.code === "TUU_ENVIRONMENT_NOT_ENABLED" || outcome?.code === "TUU_ENVIRONMENT_MISCONFIGURED") {
          setCardPaymentStatus("ERROR");
          setCardPaymentMessage("El pago con tarjeta no está habilitado para este ambiente en este equipo. No se inició ningún cobro.");
        } else {
          setCardPaymentStatus("ERROR");
          setCardPaymentMessage("No fue posible abrir TUU. No se inició ningún cobro.");
        }
        return;
      }

      if (verdict.outcome === TUU_OUTCOME.CANCELLED) {
        await reportTuuAttemptResult(started.record, "CANCELLED", tuuError);
        setTuuPendingPayments(clearTuuPendingPayment(storage, stay.id).records);
        setCardPaymentStatus("CANCELLED");
        setCardPaymentMessage("Pago cancelado.");
        return;
      }

      if (verdict.outcome === TUU_OUTCOME.DECLINED) {
        await reportTuuAttemptResult(started.record, "DECLINED", tuuError);
        setTuuPendingPayments(clearTuuPendingPayment(storage, stay.id).records);
        setCardPaymentStatus("DECLINED");
        setCardPaymentMessage(outcome?.result?.responseMessage || "Pago rechazado.");
        return;
      }

      // Tiempo de espera agotado o respuesta no interpretable: NO es un
      // rechazo. El intento queda con RESULTADO DEL PAGO INCIERTO en el
      // servidor y en el equipo; nadie puede volver a cobrar este ticket
      // hasta que llegue la respuesta tardía de TUU o un administrador lo
      // regularice.
      if (verdict.outcome === TUU_OUTCOME.UNCERTAIN) {
        const uncertain = markTuuPaymentUncertain(storage, stay.id, verdict.code, outcome?.result?.responseMessage || null);
        logTuu("PAYMENT_UNCERTAIN", uncertain.record || started.record, { reason: verdict.code || null });
        setTuuPendingPayments(uncertain.records);
        await reportTuuAttemptResult(uncertain.record || started.record, "UNCERTAIN", tuuError);
        setTuuPendingMessage("");
        setCardPaymentStatus("");
        setCardPaymentMessage("");
        setPaymentStep("MENU");
        return;
      }

      // TUU aprobó: la tarjeta YA fue cobrada. El pago aprobado se guarda en el
      // equipo ANTES de avisar al servidor y registrar; desde aquí nunca se
      // vuelve a ofrecer un cobro para este ticket.
      const approvedAt = new Date();
      rememberProcessedTuuSequence(storage, outcome.result?.transactionId);
      // Tipo de venta y últimos 4 dígitos según TUU (prevalece TUU sobre el botón).
      const tuuCard = tuuCardDetailsFromRaw(outcome.result?.rawResponse);
      const approved = markTuuPaymentApproved(storage, stay.id, { sequenceNumber: outcome.result?.transactionId, approvedAt, cardType: tuuCard.cardType, last4: tuuCard.last4 });
      setTuuPendingPayments(approved.records);
      const approvedRecord = approved.record || {
        ...started.record,
        status: "PENDING_REGISTRATION",
        sequenceNumber: /^\d{12}$/.test(String(outcome.result?.transactionId || "")) ? outcome.result.transactionId : null,
        approvedAt: approvedAt.toISOString(),
        tuuCardType: tuuCard.cardType,
        tuuLast4: tuuCard.last4,
      };
      logTuu("PAYMENT_APPROVED", approvedRecord, { persisted: approved.ok });
      setCardPaymentStatus("APPROVED");
      setCardPaymentMessage("Pago aprobado. Registrando pago...");

      // Imprime el comprobante ya, en paralelo con el registro (código PAG reservado).
      const earlyReceipt = buildEarlyCardReceiptPayload({
        stay,
        snapshot: quoteSnapshot,
        parkingResponse: selectedVehicle?.parking || parking,
        paymentCode: attempt?.reservedPaymentCode || null,
        cardType: tuuCard.cardType || paymentCardType,
        operatorName: selectedVehicle?.actor?.name || "",
        last4: tuuCard.last4,
      });
      const earlyPrint = earlyReceipt ? printLastReceipt(earlyReceipt) : null;
      if (earlyReceipt) setReceiptPrintPayload(earlyReceipt);

      const registered = await registerPendingTuuPayment(approvedRecord, { earlyPrint });
      if (!registered) {
        // Queda PAGO TUU APROBADO — PENDIENTE DE REGISTRO (ver renderPaymentModal).
        setCardPaymentStatus("");
        setCardPaymentMessage("");
        setPaymentStep("MENU");
      }
    } finally {
      cardPaymentLockRef.current = false;
      setPaymentSubmitting(false);
    }
  }

  // Avisa al servidor el resultado que entregó TUU para un intento. Si no
  // llega (sin red), queda en cola y se reintenta: mientras tanto el servidor
  // mantiene el ticket bloqueado, que es el lado seguro.
  async function reportTuuAttemptResult(record, outcome, extra = {}) {
    const report = buildTuuResultReport(record, outcome, extra);
    if (!report) return { ok: false, attempt: null };
    const response = await postCardPaymentAction(report);
    // APK 0.4.0+: el resultado guardado en el equipo se confirma (ACK) SOLO
    // cuando el servidor lo guardó o reconoció el duplicado. Con fallo de red,
    // sesión vencida o rechazo, la APK lo conserva y lo vuelve a entregar.
    if (shouldAckTuuResult(response)) ackNativeTuuResult(getNativeDeviceBridge(), report.attemptId);
    if (response.ok) {
      removeQueuedTuuResultReport(getTuuPendingStorage(), report.attemptId);
      return { ok: true, attempt: response.payload?.data?.attempt || null, response };
    }
    // Un rechazo definitivo del servidor (4xx) no se reintenta a ciegas.
    if (response.network || response.status >= 500) queueTuuResultReport(getTuuPendingStorage(), report);
    logTuu("RESULT_REPORT_FAILED", record, { outcome, code: response.code, status: response.status, queued: response.network || response.status >= 500 });
    return { ok: false, attempt: null, response };
  }

  // Reintenta los avisos de resultado que quedaron en cola.
  async function flushTuuResultReports() {
    const storage = getTuuPendingStorage();
    for (const report of loadQueuedTuuResultReports(storage)) {
      const response = await postCardPaymentAction(report);
      if (shouldAckTuuResult(response)) ackNativeTuuResult(getNativeDeviceBridge(), report.attemptId);
      if (response.ok || (!response.network && response.status < 500)) removeQueuedTuuResultReport(storage, report.attemptId);
      if (response.network) break;
    }
  }

  // Estado de los intentos según el servidor (fuente de verdad). Ajusta la
  // copia local: lo que el servidor ya resolvió se quita, lo que aprobó pasa a
  // pendiente de registro. Es solo consulta: nunca abre TUU.
  async function refreshServerCardAttempts() {
    await flushTuuResultReports();
    const response = await getPosCardPayments();
    if (!response.ok || response.payload?.data?.available !== true) return null;
    const attempts = Array.isArray(response.payload.data.attempts) ? response.payload.data.attempts : [];
    setServerCardAttempts(attempts);
    setTuuPendingPayments(reconcileTuuPendingWithServer(getTuuPendingStorage(), attempts));
    return attempts;
  }

  // REGISTRAR PAGO: registra en ParkFacil un pago que TUU YA aprobó, por su
  // intento reservado. El monto y los datos son los que el servidor fijó al
  // reservar. NUNCA abre TUU: no llama a startTuuPayment ni al bridge.
  async function registerPendingTuuPayment(record, { earlyPrint = null } = {}) {
    const body = buildTuuRegistrationRequest(record);
    if (!body) return false;
    const storage = getTuuPendingStorage();
    const isLocal = record.source !== "SERVER";
    const registrationFailed = (message, reason) => {
      if (isLocal) setTuuPendingPayments(noteTuuRegistrationFailure(storage, record.stayId, reason || message).records);
      setTuuPendingMessage(message);
      logTuu("REGISTRATION_ERROR", record, { reason: reason || message });
    };

    setTuuPendingBusy(true);
    setTuuPendingMessage("");
    logTuu("REGISTRATION_ATTEMPT", record, { attempts: (record.registrationAttempts || 0) + 1 });
    try {
      // 0) Camino rápido (SOL-2026-10-11-001): aprobación y registro en UNA llamada.
      //    Si falla, se sigue el camino de siempre (aviso y luego registro).
      let response = null;
      if (isLocal) {
        const combined = await postCardPaymentAction(buildTuuRegistrationRequest(record, { includeApprovedResult: true }));
        if (combined.ok) {
          if (shouldAckTuuResult(combined)) ackNativeTuuResult(getNativeDeviceBridge(), record.attemptId);
          removeQueuedTuuResultReport(storage, record.attemptId);
          response = combined;
        } else if (combined.status === 401) {
          registrationFailed("Tu sesión expiró. Inicia sesión nuevamente y usa REGISTRAR PAGO. El pago TUU ya está aprobado: no vuelva a cobrar.", "session_expired");
          return false;
        }
      }

      // 1) El servidor debe conocer la aprobación de este intento (si el pago
      //    se aprobó en este equipo). Repetir el aviso no cambia nada.
      if (isLocal && !response) {
        const reported = await reportTuuAttemptResult(record, "APPROVED", { reference: record.sequenceNumber });
        if (!reported.ok) {
          const response = reported.response;
          if (response?.status === 401) {
            registrationFailed("Tu sesión expiró. Inicia sesión nuevamente y usa REGISTRAR PAGO. El pago TUU ya está aprobado: no vuelva a cobrar.", "session_expired");
          } else if (!response || response.network || response.status >= 500) {
            registrationFailed("Sin conexión con ParkFacil. El pago TUU ya está aprobado: no vuelva a cobrar. Use REGISTRAR PAGO cuando vuelva la conexión.", "network_error");
          } else {
            registrationFailed(`ParkFacil no aceptó el resultado del pago (${response.payload?.error || "error desconocido"}). No vuelva a cobrar: avise a su administrador.`, response.code || `http_${response.status}`);
            await refreshServerCardAttempts();
          }
          return false;
        }
        // El servidor puede dejarlo incierto (p. ej. referencia ya usada).
        if (reported.attempt && !["APPROVED_PENDING_REGISTRATION", "PAID"].includes(reported.attempt.status)) {
          registrationFailed("El pago quedó con resultado incierto en ParkFacil. No vuelva a cobrar: un administrador debe regularizarlo.", reported.attempt.errorCode || reported.attempt.status);
          await refreshServerCardAttempts();
          return false;
        }
      }

      // 2) Registro del pago en el ticket y cierre del intento (una transacción).
      if (!response) response = await postCardPaymentAction(body);
      if (!response.ok) {
        if (response.status === 401) {
          registrationFailed("Tu sesión expiró. Inicia sesión nuevamente y usa REGISTRAR PAGO. El pago TUU ya está aprobado: no vuelva a cobrar.", "session_expired");
        } else if (response.network) {
          registrationFailed("Sin conexión con ParkFacil. El pago TUU ya está aprobado: no vuelva a cobrar. Use REGISTRAR PAGO cuando vuelva la conexión.", "network_error");
        } else {
          registrationFailed(`No se pudo registrar el pago en ParkFacil (${response.payload?.error || "error desconocido"}). El pago TUU ya está aprobado: no vuelva a cobrar.`, response.code || `http_${response.status}`);
        }
        return false;
      }
      const payload = response.payload;

      // Registrado: se quita la copia local; el intento quedó PAID en el servidor.
      setTuuPendingPayments(clearTuuPendingPayment(storage, record.stayId).records);
      setServerCardAttempts((current) => current.filter((item) => item.id !== record.attemptId));
      setTuuPendingMessage("");
      setTuuPendingViewStayId(null);
      logTuu("REGISTRATION_OK", record, {
        registration: payload?.data?.cardPaymentRegistration || null,
        alreadyRegistered: Boolean(payload?.data?.alreadyRegistered),
        paymentCode: payload?.data?.quote?.paymentCode || null,
      });

      const registeredStay = payload?.data?.stay || null;
      // Últimos 4 dígitos según TUU aunque la base aún no tenga la columna.
      const stay = registeredStay ? { ...registeredStay, card_last4: registeredStay.card_last4 || record.tuuLast4 || null } : null;
      const quote = payload?.data?.quote || null;
      const parkingResponse = payload?.data?.parking || parking;
      const plate = stay?.license_plate || record.plate;
      const receiptPayload = buildPaymentReceiptPayload(stay, quote, parkingResponse, "CARD");
      const inPaymentModal = paymentModalOpen && selectedVehicle?.stay?.id === record.stayId;
      if (inPaymentModal) {
        setPaymentResult({
          plate,
          total: Number(quote?.total || record.amount || 0),
          paymentMethod: classifiedPaymentMethod(stay) || "CARD",
          cardLast4: stay?.card_last4 || null,
        });
      }
      setReceiptPrintPayload(receiptPayload);
      // Imprime apenas el servidor confirma el registro (QA PRO2 2026-10-19): antes
      // se esperaba la recarga del terminal (~3,7 s) antes de pedir la impresión.
      // La recarga corre en paralelo y se espera antes de volver al inicio. Si el
      // comprobante ya se imprimió al aprobar TUU (earlyPrint), no se repite.
      const terminalRefresh = loadTerminalState(true);
      if (!earlyPrint) setReceiptPrintStatus("");
      const printResult = earlyPrint ? await earlyPrint : receiptPayload ? await printLastReceipt(receiptPayload) : null;
      await terminalRefresh;
      const printFailedOnDevice = Boolean(printResult?.attempted && !printResult.ok);

      if (inPaymentModal) {
        if (printFailedOnDevice) {
          setPaymentStep("PRINT_PROMPT");
        } else {
          finishPaidFlow();
        }
      } else {
        setTuuPendingNotice(`Pago de ${plate || "el ticket"} registrado en ParkFacil.${printFailedOnDevice ? " No se pudo imprimir el comprobante: usa REIMPRIMIR TICKET." : ""}`);
        void loadPaymentsToday();
      }
      return true;
    } finally {
      setTuuPendingBusy(false);
    }
  }

  // Resultado de TUU que la APK 0.4.0+ entrega asociado a su intento
  // (attemptId): en vivo cuando ya nadie lo espera, o guardado en el equipo
  // y releído al cargar. Se informa al servidor con ESE identificador; la APK
  // recién lo descarta cuando el servidor lo guardó (ver reportTuuAttemptResult).
  // Nunca abre TUU.
  async function processCorrelatedTuuResult(result) {
    const attemptId = result?.attemptId;
    if (!attemptId || nativeTuuResultsBusyRef.current.has(attemptId)) return;
    nativeTuuResultsBusyRef.current.add(attemptId);
    try {
      const storage = getTuuPendingStorage();
      const local = findTuuPendingPaymentByAttempt(loadTuuPendingPayments(storage), attemptId);
      // Sin registro local (datos del WebView borrados): se informa igual, con
      // el identificador de este equipo.
      const target = local || { attemptId, deviceId: getPosDeviceId(), stayId: null };
      const verdict = classifyTuuOutcome({ delivered: true, result });
      logTuu("NATIVE_RESULT", local, { attemptId, outcome: verdict.outcome, errorCode: verdict.code || null, late: result?.late === true, sequenceNumber: result?.transactionId || null, hasLocalRecord: Boolean(local) });
      const tuuError = { errorCode: verdict.code || null, errorMessage: result?.responseMessage || null };

      if (verdict.outcome === TUU_OUTCOME.APPROVED) {
        rememberProcessedTuuSequence(storage, result?.transactionId);
        let record = local;
        if (local) {
          const approved = markTuuPaymentApproved(storage, local.stayId, { sequenceNumber: result?.transactionId });
          setTuuPendingPayments(approved.records);
          record = approved.record || local;
        }
        const reported = await reportTuuAttemptResult(record || target, "APPROVED", { reference: result?.transactionId });
        if (reported.ok && record?.status === "PENDING_REGISTRATION" && !cardPaymentLockRef.current) void registerPendingTuuPayment(record);
        else await refreshServerCardAttempts();
        return;
      }
      if (verdict.outcome === TUU_OUTCOME.DECLINED || verdict.outcome === TUU_OUTCOME.CANCELLED) {
        await reportTuuAttemptResult(target, verdict.outcome === TUU_OUTCOME.DECLINED ? "DECLINED" : "CANCELLED", tuuError);
        if (local) {
          setTuuPendingPayments(clearTuuPendingPayment(storage, local.stayId).records);
          setTuuPendingNotice(`TUU informó que el pago de ${local.plate || "el ticket"} no se realizó.`);
        }
        await refreshServerCardAttempts();
        return;
      }
      // Sigue incierto: se deja constancia del mensaje de TUU.
      let uncertainRecord = target;
      if (local) {
        const uncertain = markTuuPaymentUncertain(storage, local.stayId, verdict.code, result?.responseMessage || null);
        setTuuPendingPayments(uncertain.records);
        uncertainRecord = uncertain.record || local;
      }
      await reportTuuAttemptResult(uncertainRecord, "UNCERTAIN", tuuError);
    } finally {
      nativeTuuResultsBusyRef.current.delete(attemptId);
    }
  }

  // Lee lo que la APK 0.4.0+ tiene guardado (resultados sin confirmar e intento
  // sin resultado) y lo informa al servidor. Es solo aviso y consulta: nunca
  // abre TUU. Con la APK 0.3.13 no hace nada.
  //   - Resultado guardado: se informa; la APK lo descarta solo si el servidor
  //     lo guardó. Sin red queda guardado y se reintenta.
  //   - Intento sin resultado que la APK ya no espera (el proceso murió y
  //     Android no entregó la respuesta): se informa como incierto y se libera
  //     en la APK. El ticket sigue bloqueado hasta la regularización.
  async function syncNativeTuuState({ fromPaymentFlow = false } = {}) {
    if (tuuResultRouter.isWaiting()) return;
    if (cardPaymentLockRef.current && !fromPaymentFlow) return;
    const bridge = getNativeDeviceBridge();
    const actions = planNativeTuuSync(readPendingTuuState(bridge));
    for (const action of actions) {
      if (action.type === "RESULT") {
        await processCorrelatedTuuResult({ ...parseTuuResult(action.result), attemptId: action.attemptId, late: action.late });
        continue;
      }
      const storage = getTuuPendingStorage();
      const local = findTuuPendingPaymentByAttempt(loadTuuPendingPayments(storage), action.attemptId);
      let record = local || { attemptId: action.attemptId, deviceId: getPosDeviceId(), stayId: null };
      if (local) {
        const uncertain = markTuuPaymentUncertain(storage, local.stayId, "RESULT_NOT_DELIVERED", null);
        setTuuPendingPayments(uncertain.records);
        record = uncertain.record || local;
      }
      logTuu("NATIVE_ATTEMPT_WITHOUT_RESULT", local, { attemptId: action.attemptId });
      const reported = await reportTuuAttemptResult(record, "UNCERTAIN", { errorCode: "RESULT_NOT_DELIVERED" });
      if (shouldAbandonLostTuuAttempt(reported.response)) {
        const released = abandonNativeTuuAttempt(bridge, action.attemptId);
        logTuu("NATIVE_ATTEMPT_RELEASED", local, { attemptId: action.attemptId, ok: released.ok, code: released.code || null });
      }
    }
    if (actions.length && !fromPaymentFlow) await refreshServerCardAttempts();
  }

  // Respuesta de TUU que llega cuando ya nadie la espera (después del tiempo
  // de espera, o tras recargar la app). Se asocia al intento sin resolver más
  // reciente de ESTE equipo y se informa al servidor con el identificador de
  // ese intento. Si fue aprobada se intenta registrar; si TUU informa que no
  // cobró, el servidor libera el ticket.
  async function handleLateTuuResult(result) {
    // APK 0.4.0+: un resultado que la APK no pudo asociar a ningún intento
    // NUNCA se asigna a un ticket. Solo queda constancia.
    if (result?.uncorrelated === true) {
      console.warn("[pos:tuu]", { event: "UNCORRELATED_RESULT_IGNORED", success: result?.success === true, sequenceNumber: result?.transactionId || null });
      return;
    }
    // APK 0.4.0+: el resultado trae su intento.
    if (result?.attemptId) {
      await processCorrelatedTuuResult(result);
      return;
    }
    // APK 0.3.13 (sin correlación): criterio anterior.
    const storage = getTuuPendingStorage();
    const target = latestUnresolvedTuuPayment(loadTuuPendingPayments(storage));
    const verdict = classifyTuuOutcome({ delivered: true, result });
    logTuu("LATE_RESULT", target, {
      outcome: verdict.outcome,
      errorCode: verdict.code || null,
      errorMessage: result?.responseMessage || null,
      sequenceNumber: result?.transactionId || null,
      matched: Boolean(target),
    });
    if (!target) return;

    if (verdict.outcome === TUU_OUTCOME.APPROVED) {
      rememberProcessedTuuSequence(storage, result?.transactionId);
      const approved = markTuuPaymentApproved(storage, target.stayId, { sequenceNumber: result?.transactionId });
      setTuuPendingPayments(approved.records);
      if (approved.record && !approved.duplicate) void registerPendingTuuPayment(approved.record);
      return;
    }
    if (verdict.outcome === TUU_OUTCOME.DECLINED || verdict.outcome === TUU_OUTCOME.CANCELLED) {
      await reportTuuAttemptResult(target, verdict.outcome === TUU_OUTCOME.DECLINED ? "DECLINED" : "CANCELLED", { errorCode: verdict.code, errorMessage: result?.responseMessage || null });
      setTuuPendingPayments(clearTuuPendingPayment(storage, target.stayId).records);
      setTuuPendingNotice(`TUU informó que el pago de ${target.plate || "el ticket"} no se realizó.`);
      await refreshServerCardAttempts();
      return;
    }
    // Sigue incierto: se deja constancia del mensaje de TUU.
    const uncertain = markTuuPaymentUncertain(storage, target.stayId, verdict.code, result?.responseMessage || null);
    setTuuPendingPayments(uncertain.records);
    await reportTuuAttemptResult(uncertain.record || target, "UNCERTAIN", { errorCode: verdict.code, errorMessage: result?.responseMessage || null });
  }

  // ACTUALIZAR ESTADO: consulta al servidor (p. ej. tras una regularización).
  async function refreshTuuPendingStatus(stayId) {
    setTuuPendingBusy(true);
    setTuuPendingMessage("");
    try {
      const attempts = await refreshServerCardAttempts();
      setTuuPendingMessage(tuuRefreshResultMessage(attempts, stayId));
      if (attempts !== null && selectedVehicle?.stay?.id) void openVehicleDetail(selectedVehicle.stay);
    } finally {
      setTuuPendingBusy(false);
    }
  }

  async function printLastEntryTicket(payload, photoOptions) {
    const printPayload = payload || entryPrintPayload;
    if (!printPayload) {
      setEntryPrintStatus("No hay un ticket disponible para reimpresión.");
      return { attempted: false, ok: false, code: "NO_TICKET", message: "No hay ticket disponible." };
    }

    setEntryPrintBusy(true);
    setEntryPrintStatus("Imprimiendo...");

    try {
      const photoBase64 = photoOptions?.photoBase64 ?? entryPhotoForPrint;
      const result = await executeAutoPrint(printPayload, toAgentEntryPayload, {
        photoBase64,
        printOnTicket: printPlatePhotoOnTicket,
      });

      if (result.ok) {
        setEntryPrintStatus(
          result.photoIncluded ? "Ticket impreso con fotografía de patente." : "Ticket impreso."
        );
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setEntryPrintStatus([
          "Entrada registrada. No fue posible imprimir el ticket.",
          ...details,
        ].join("\n"));
      }

      // La fotografía se pidió imprimir pero el bridge no la soporta: no es
      // un error de impresión (el ticket de texto sí se imprimió bien), solo
      // una limitación informativa para el operador (§9 del encargo).
      if (result.ok && photoBase64 && printPlatePhotoOnTicket && !result.photoIncluded) {
        setEntryPrintStatus((current) => `${current}\nFotografía no impresa: el dispositivo no admite impresión de imágenes.`);
      }

      return result;
    } finally {
      setEntryPrintBusy(false);
    }
  }

  // Impresión del recibo de pago EFECTIVO. Es un efecto secundario del pago,
  // ya registrado y cerrado en el backend antes de llegar aquí: si esta
  // llamada falla, no se reintenta el cobro ni se vuelve a cerrar la
  // permanencia — solo se reutiliza el mismo receiptPrintPayload.
  async function printLastReceipt(payload) {
    const printPayload = payload || receiptPrintPayload;
    if (!printPayload) {
      setReceiptPrintStatus("No hay un recibo disponible para reimpresión.");
      return { attempted: false, ok: false, code: "NO_RECEIPT", message: "No hay recibo disponible." };
    }

    setReceiptPrintBusy(true);
    setReceiptPrintStatus("Imprimiendo...");

    try {
      const result = await executeAutoPrint(printPayload, toAgentExitPayload);

      if (result.ok) {
        setReceiptPrintStatus("Recibo impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setReceiptPrintStatus([
          "Pago registrado. No fue posible imprimir el recibo.",
          ...details,
        ].join("\n"));
      }

      return result;
    } finally {
      setReceiptPrintBusy(false);
    }
  }

  function openCloseConfirm() {
    setCloseError("");
    setCloseConfirmOpen(true);
  }

  function cancelCloseConfirm() {
    setCloseConfirmOpen(false);
  }

  // Confirma el cierre de caja. El backend recalcula todo server-side
  // (close_pos_shift) — este handler solo envía lo que el operador declaró
  // (efectivo contado, observación) y muestra el resultado ya persistido.
  // No imprime automáticamente (regla 14): tras confirmar, se pasa al paso
  // de la pregunta ¿DESEA IMPRIMIR EL CIERRE?
  async function confirmShiftClosure() {
    if (!shift?.id || closeSubmitting) return;

    setCloseSubmitting(true);
    setCloseError("");

    try {
      const result = await postCloseShift({
        declaredCashAmount: declaredCashInput === "" ? null : Number(declaredCashInput),
        differenceObservation: differenceObservationInput,
        confirm: true,
      });

      if (!result.ok) {
        if (result.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        setCloseError(result.payload?.error || "No fue posible cerrar el turno.");
        return;
      }

      const closure = result.payload?.data?.closure || null;
      setClosedUnpaidExits(result.payload?.data?.unpaidExits || null);
      setShiftClosure(closure);
      setShiftClosed(true);
      setShift((current) => (current ? { ...current, status: "CLOSED", closedAt: closure?.shiftClosedAt || current.closedAt } : current));
      setCloseConfirmOpen(false);
      setClosureReceiptPayload(buildShiftClosureReceiptPayload(
        closure,
        parking,
        context?.membership?.fullName || context?.email,
        context?.email
      ));
      setClosureReceiptStatus("");
      setClosurePrintPrompt(true);
      // Tras el cierre ya no hay turno abierto: el estado del turno vuelve al
      // servidor (selector si hay varios Off Street). Se conserva el
      // estacionamiento del cierre para el resumen y la reimpresión.
      setLastClosedParking(parking);
      void loadShiftState();
      void loadTerminalState(true);
    } catch {
      setCloseError("Error de red al cerrar el turno.");
    } finally {
      setCloseSubmitting(false);
    }
  }

  // Impresión del comprobante de cierre. Efecto secundario del cierre YA
  // confirmado e inmutable: si falla, el cierre permanece registrado (regla
  // 10/14) — nunca se vuelve a calcular ni a cerrar el turno.
  async function printClosureReceipt(payload) {
    const printPayload = payload || closureReceiptPayload;
    if (!printPayload) {
      setClosureReceiptStatus("No hay un cierre disponible para imprimir.");
      return { attempted: false, ok: false, code: "NO_CLOSURE", message: "No hay cierre disponible." };
    }

    const bridge = getNativePrinterBridge();
    if (!bridge) {
      setClosureReceiptStatus("Impresión disponible solo desde el dispositivo POS.");
      return { attempted: false, ok: false, code: "BRIDGE_UNAVAILABLE", message: "Bridge no disponible." };
    }

    setClosureReceiptBusy(true);
    setClosureReceiptStatus("Imprimiendo...");

    try {
      const result = await executeNativePrint(printPayload);

      if (result.ok) {
        setClosureReceiptStatus("Cierre impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setClosureReceiptStatus([
          "Cierre registrado. No fue posible imprimir el comprobante.",
          ...details,
        ].join("\n"));
      }

      return result;
    } finally {
      setClosureReceiptBusy(false);
    }
  }

  async function confirmClosurePrint() {
    const result = await printClosureReceipt(closureReceiptPayload);
    if (result?.ok) {
      setClosurePrintPrompt(false);
    }
  }

  function declineClosurePrint() {
    setClosurePrintPrompt(false);
    setClosureReceiptStatus("");
  }

  // REIMPRIMIR CIERRE (turno ya cerrado, fuera del flujo de confirmación):
  // reconstruye el mismo payload desde el cierre persistido — nunca vuelve
  // a cobrar ni a cerrar el turno (regla 5 original / "no crear nueva
  // operación").
  function reprintShiftClosure() {
    const payload = buildShiftClosureReceiptPayload(
      shiftClosure,
      parking || lastClosedParking,
      context?.membership?.fullName || context?.email,
      context?.email
    );
    setClosureReceiptPayload(payload);
    setClosureReceiptStatus("");
    void printClosureReceipt(payload);
  }

  // IMPRIMIR VEHÍCULOS EN EL PARKING: nunca imprime automáticamente. Al
  // pulsar el botón se arma el payload y se pregunta SÍ/NO; solo con SÍ se
  // intenta imprimir (una sola vez por clic).
  function openListadoPrintPrompt() {
    setListadoPrintPayload(buildParkingVehiclesListPayload(activeStays, parking, new Date()));
    setListadoPrintStatus("");
    setListadoPrintPrompt(true);
  }

  function declineListadoPrint() {
    setListadoPrintPrompt(false);
    setListadoPrintPayload(null);
    setListadoPrintStatus("");
  }

  // IMPRIMIR PAGOS DEL DÍA: imprime exactamente lo que muestra la pantalla
  // (totales y filas de /api/pos/payments), una vez por clic.
  async function printPaymentsDay() {
    if (paymentsDayPrintBusy) return;
    const payload = buildPaymentsDayPrintPayload({ payments: paymentsToday, totals: paymentsTodayTotals, parking });
    if (!payload) {
      setPaymentsDayPrintStatus("No hay datos del estacionamiento para imprimir el reporte.");
      return;
    }
    if (!getNativePrinterBridge()) {
      setPaymentsDayPrintStatus("Impresión disponible solo desde el dispositivo POS.");
      return;
    }
    setPaymentsDayPrintBusy(true);
    setPaymentsDayPrintStatus("Imprimiendo...");
    try {
      const result = await executeNativePrint(payload);
      if (result.ok) {
        setPaymentsDayPrintStatus("Reporte de pagos del día impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setPaymentsDayPrintStatus(["No fue posible imprimir el reporte.", ...details].join("\n"));
      }
    } finally {
      setPaymentsDayPrintBusy(false);
    }
  }

  async function confirmListadoPrint() {
    const printPayload = listadoPrintPayload;
    if (!printPayload) {
      setListadoPrintStatus("No hay un listado disponible para imprimir.");
      return;
    }

    const bridge = getNativePrinterBridge();
    if (!bridge) {
      setListadoPrintStatus("Impresión disponible solo desde el dispositivo POS.");
      return;
    }

    setListadoPrintBusy(true);
    setListadoPrintStatus("Imprimiendo...");

    try {
      const result = await executeNativePrint(printPayload);
      if (result.ok) {
        setListadoPrintStatus("Listado impreso.");
      } else {
        const details = [];
        if (result.code) details.push(`Código: ${result.code}`);
        if (result.message) details.push(`Detalle: ${result.message}`);
        setListadoPrintStatus([
          "No fue posible imprimir el listado.",
          ...details,
        ].join("\n"));
      }
    } finally {
      setListadoPrintBusy(false);
    }
  }

  async function submitEntry(event, confirmedPlateOverride = null, releasedOverride = undefined) {
    event?.preventDefault?.();
    // Fase 2: doble toque / respuesta lenta -> nunca un segundo POST.
    if (entrySubmitLockRef.current) return;
    const formattedPlate = formatPosPlateInput(entryPlate);
    if (!POS_PLATE_REGEX.test(formattedPlate)) {
      setEntryFailure("INVALID_PLATE");
      return;
    }
    const plate = toBackendPlate(formattedPlate);
    // Fase 2: confirmación explícita obligatoria. Solo se registra la
    // patente que el operador confirmó con CONFIRMAR (ni el OCR ni la voz
    // llegan aquí sin pasar por ese paso).
    const confirmedPlate = confirmedPlateOverride ?? entryConfirmedPlate;
    if (!confirmedPlate || confirmedPlate !== plate) {
      setEntryConfirmedPlate("");
      setEntryStep("CONFIRM");
      return;
    }
    // Gate de UX (regla real la vuelve a exigir /api/data-entry): en modo
    // REQUIRED no se ni siquiera intenta enviar sin fotografía ya capturada.
    const releasedForEntry = releasedOverride !== undefined ? releasedOverride : entryReleased?.plate === confirmedPlate ? entryReleased : null;
    const effectivePhotoMode = releasedForEntry?.released ? "REQUIRED" : platePhotoMode;
    if (effectivePhotoMode === "REQUIRED" && !entryPhoto) {
      setEntryErrorCode("PLATE_PHOTO_REQUIRED");
      setEntryError(releasedForEntry?.released ? "Patente liberada: la foto de la patente es obligatoria en cada ingreso." : entryPhotoRequirementMessage(platePhotoMode));
      setEntryStep("PHOTO");
      return;
    }

    entrySubmitLockRef.current = true;
    setEntrySubmitting(true);
    clearEntryFailure();

    try {
      // deviceInfo se recolecta siempre (§20), incluso sin fotografía --
      // best-effort, nunca bloquea el ENTRY; el backend igual lo descarta
      // si no hay evidencia a la que asociarlo.
      const deviceInfo = await collectDeviceInfoForEntry();
      const response = await fetch("/api/data-entry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-parkfacil-portal": "terminal",
        },
        cache: "no-store",
        body: JSON.stringify({
          action: "ENTRY",
          plate,
          source: "POS",
          deviceInfo,
          expectReleased: Boolean(releasedForEntry?.released),
          ...(entryPhoto
            ? {
                platePhotoBase64: entryPhoto.base64,
                platePhotoMimeType: entryPhoto.mimeType,
                platePhotoCapturedAt: entryPhoto.capturedAt || null,
                platePhotoLatitude: entryPhoto.latitude ?? null,
                platePhotoLongitude: entryPhoto.longitude ?? null,
                platePhotoGpsAccuracyM: entryPhoto.gpsAccuracyM ?? null,
              }
            : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Fase 1: sesión vencida durante la operación -> nunca se deja al
        // operador en una pantalla operativa sin sesión válida.
        if (response.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        // Fase 2: cada rechazo con su mensaje y acción (un 409 de vehículo
        // ya ingresado nunca se muestra como error genérico).
        if (payload?.details?.code === "RELEASED_PAYMENT_CHANGED") {
          // La condición cambió entre la validación y el registro (cupo,
          // vigencia, módulo): se muestra el nuevo estado y se vuelve a
          // confirmar.
          const fresh = payload?.details?.releasedPayment || null;
          setEntryReleasedState(fresh ? { ...fresh, plate, acknowledged: false } : null);
          setEntryStep("CONFIRM");
          setEntryErrorCode("RELEASED_PAYMENT_CHANGED");
          setEntryError(payload?.error || "La patente cambió de condición. Vuelve a confirmar.");
          return;
        }
        const failureCode = classifyEntryFailure(response.status, payload);
        setEntryErrorCode(failureCode);
        setEntryError(failureCode === "UNEXPECTED" && payload?.error ? payload.error : entryErrorMessage(failureCode));
        if (failureCode === "VEHICLE_ALREADY_INSIDE") void loadTerminalState(true);
        return;
      }

      const stay = payload?.data?.stay || null;
      const parkingResponse = payload?.data?.parking || parking;
      setEntryConfirmedPlate("");
      if (ocrPhoto?.previewUrl && ocrPhoto !== entryPhoto) URL.revokeObjectURL(ocrPhoto.previewUrl);
      setOcrPhoto(null);
      setEntryStep("PLATE");
      setEntrySuccess(stay ? { stay, parking: parkingResponse, debtNotice: payload?.data?.debtNotice || null } : null);
      const printPayload = buildEntryPrintPayload(stay, parkingResponse);
      // Ticket "PAGO LIBERADO": leyenda para el agente de impresión y el
      // bridge nativo (cada impresora la muestra si la soporta).
      if (printPayload && payload?.data?.releasedPayment?.applied) {
        printPayload.ticketLabel = "PAGO LIBERADO";
        if (printPayload.agentTicket) printPayload.agentTicket = { ...printPayload.agentTicket, ticketLabel: "PAGO LIBERADO" };
      }
      // Coordenadas de la foto (si el GPS las entregó): línea "GPS:" del ticket.
      const ticketCoordinates = formatTicketCoordinates(entryPhoto?.latitude, entryPhoto?.longitude);
      if (printPayload && ticketCoordinates) {
        printPayload.ubicacion = ticketCoordinates;
        if (printPayload.agentTicket) printPayload.agentTicket = { ...printPayload.agentTicket, ubicacion: ticketCoordinates };
      }
      setEntryReleasedState(null);
      setEntryPrintPayload(printPayload);
      // Los bytes de la foto ya están en el cliente (recién comprimidos) --
      // se conservan para poder incluirlos al imprimir/reimprimir el
      // ticket, independientemente de si el registro de metadata en
      // servidor (parking_stay_evidence) llegó a vincularse o no. Se usa la
      // variable local (no el state, que todavía no se actualizó) para la
      // impresión inmediata de abajo.
      const capturedPhotoBase64 = entryPhoto?.base64 || null;
      setEntryPhotoForPrint(capturedPhotoBase64);
      if (entryPhoto?.previewUrl) URL.revokeObjectURL(entryPhoto.previewUrl);
      setEntryPhoto(null);
      // Si la cámara de evidencia siguiera abierta se cierra: al desmontarse,
      // PlatePhotoCapture ya no entrega una captura tardía al vehículo siguiente.
      setPhotoCaptureOpen(false);
      setEntryPlate("");
      setEntryOpen(false);
      setCurrentView(POS_VIEWS.INGRESO);
      setVehiclesInside((current) => current + 1);
      void loadTerminalState(true);

      const printResult = printPayload
        ? await printLastEntryTicket(printPayload, { photoBase64: capturedPhotoBase64 })
        : null;
      // Solo se bloquea el retorno a HOME cuando existe bridge nativo y la
      // impresión se intentó pero falló (regla 3). Sin bridge (PC/navegador,
      // regla 2) o con impresión exitosa (regla 1), el ingreso ya es un
      // flujo de negocio completo y se vuelve a HOME.
      const printFailedOnDevice = Boolean(printResult?.attempted && !printResult.ok);

      if (!printFailedOnDevice) {
        setEntryOpen(false);
        setEntryError("");
        setEntrySuccess(null);
        setEntryPrintStatus("");
        setCurrentView(POS_VIEWS.HOME);
      }
    } catch {
      setEntryFailure("NETWORK_ERROR");
    } finally {
      entrySubmitLockRef.current = false;
      setEntrySubmitting(false);
    }
  }

  // Pagos con tarjeta sin cerrar (este equipo + servidor): alimentan la alerta
  // del inicio, el contador del menú y la pantalla «Pagos por resolver».
  const tuuPendingViews = mergeTuuPendingViews(tuuPendingPayments, serverCardAttempts, { deviceId: getKnownPosDeviceIds() });

  const navItems = [
    { label: "INICIO", onSelect: () => goToSection(POS_VIEWS.HOME) },
    ...(tuuPendingViews.length ? [{ label: `PAGOS POR RESOLVER (${tuuPendingViews.length})`, alert: true, onSelect: () => goToSection(POS_VIEWS.PAGOS_POR_RESOLVER) }] : []),
    // Después de INICIO: iniciar (o ver) el turno del operador.
    // (misma condición que shiftReadyForOperations, que se declara más abajo)
    { label: shiftState === "OPEN" && shift?.status !== "CLOSING" ? "TURNO ACTIVO" : "INICIO DE TURNO", onSelect: () => goToSection(POS_VIEWS.TURNO) },
    { label: "INGRESO DE VEHÍCULO", onSelect: openEntryForm },
    { label: "SALIDA DE VEHÍCULO", onSelect: () => goToSection(POS_VIEWS.SALIDA) },
    { label: "VEHÍCULOS EN EL PARKING", onSelect: () => goToSection(POS_VIEWS.VEHICULOS) },
    { label: "CÓDIGO QR", onSelect: () => goToSection(POS_VIEWS.QR) },
    { label: "BUSCAR TICKET", onSelect: () => openBuscar("search") },
    // Elegir qué ticket reimprimir (antes reimprimía siempre el último).
    { label: "REIMPRIMIR TICKET", onSelect: () => openBuscar("reprint") },
    { label: "IMPRIMIR VEHÍCULOS EN EL PARKING", onSelect: () => goToSection(POS_VIEWS.IMPRIMIR_LISTADO) },
    { label: "PAGOS DEL DÍA", onSelect: () => goToSection(POS_VIEWS.PAGOS_DEL_DIA) },
    { label: "CIERRE DE CAJA", onSelect: () => goToSection(POS_VIEWS.CIERRE_CAJA) },
    {
      label: "ACTUALIZAR APLICACIÓN",
      onSelect: () => {
        closeSidebar();
        void loadTerminalState(true);
      },
    },
    { label: "ESTADO DEL DISPOSITIVO", onSelect: () => goToSection(POS_VIEWS.ESTADO_DISPOSITIVO) },
    {
      label: "CERRAR SESIÓN",
      onSelect: () => {
        closeSidebar();
        void logout();
      },
    },
  ];

  // Indica si INGRESO/SALIDA pueden habilitarse: solo con turno realmente
  // OPEN (no CLOSING). Es una mejora de UX preventiva — la autoridad real
  // sigue siendo requireOpenPosShift() en /api/data-entry, que exige
  // status='OPEN' exacto y rechaza igual aunque este chequeo se omita.
  const shiftReadyForOperations = shiftState === "OPEN" && shift?.status !== "CLOSING";

  // Gate reutilizable de turno para INGRESO y SALIDA (Home ya resuelve su
  // propio bloqueo con shiftReadyForOperations sobre los botones). Devuelve
  // null cuando el turno está OPEN y no en CLOSING — en ese caso el panel
  // real se renderiza normalmente. No duplica la lógica de
  // renderCierreCajaPanel: cubre el mismo conjunto de estados
  // (loading/error/PROGRAMMED/CLOSING/sin turno) para los paneles nuevos.
  function renderShiftGate(title, { hideVolver = false } = {}) {
    if (shiftReadyForOperations) return null;

    const volverButton = hideVolver ? null : (
      <button type="button" onClick={() => goToSection(POS_VIEWS.HOME)} className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100">Volver</button>
    );

    if (shiftLoading && !shift) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-slate-600" />
            <p className="text-sm font-semibold">Cargando turno del operador...</p>
          </div>
        </section>
      );
    }

    if (shiftError) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{shiftError}</div>
          {volverButton}
        </section>
      );
    }

    // Fase 1: varios estacionamientos autorizados -> el operador elige
    // explícitamente qué turno programado iniciar. Las opciones vienen del
    // servidor (solo estacionamientos autorizados de su empresa); una vez
    // iniciado, el turno abierto fija el estacionamiento para toda la sesión.
    if (shiftState === "PARKING_SELECTION_REQUIRED" && offStreetParkings.length) {
      // Selector Off Street: pulldown con todos los Off Street activos de la
      // empresa (no depende de las asignaciones del operador). parkingOptions
      // solo trae aquí turnos On Street programados hoy, que se inician igual
      // que antes.
      const selectedOffStreet = offStreetParkings.find((option) => option.parkingId === selectedOffStreetParkingId) || null;
      return (
        <section className="rounded-3xl border border-sky-300 bg-white p-5 text-slate-800 shadow-sm">
          {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
          <div className="mt-4 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-sky-700">Seleccione estacionamiento</p>
            <p className="mt-1 text-sm font-semibold">Elige dónde vas a operar. El estacionamiento quedará fijo hasta que hagas el cierre de caja.</p>
          </div>
          <label htmlFor="pos-offstreet-parking" className="mt-4 block text-xs font-black uppercase tracking-[0.08em] text-slate-600">Estacionamiento</label>
          <select
            id="pos-offstreet-parking"
            value={selectedOffStreetParkingId}
            onChange={(event) => { setSelectedOffStreetParkingId(event.target.value); setOffStreetSelectionError(""); }}
            disabled={shiftStartBusy}
            className="mt-1 min-h-14 w-full rounded-2xl border border-slate-400 bg-white px-3 py-3 text-base font-bold text-slate-900 disabled:opacity-60"
          >
            <option value="">Elige un estacionamiento</option>
            {offStreetParkings.map((option) => (
              <option key={option.parkingId} value={option.parkingId}>
                {option.parkingName || option.parkingCode}{option.parkingName && option.parkingCode ? ` · ${option.parkingCode}` : ""}
              </option>
            ))}
          </select>
          {selectedOffStreet ? (
            <div className="mt-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
              <p>Vas a operar en <span className="font-black">{selectedOffStreet.parkingName || selectedOffStreet.parkingCode}</span>.</p>
              {selectedOffStreet.parkingAddress ? <p className="mt-1 text-xs text-emerald-900">{selectedOffStreet.parkingAddress}</p> : null}
            </div>
          ) : null}
          {offStreetSelectionError ? <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{offStreetSelectionError}</p> : null}
          <button type="button" onClick={startSelectedOffStreetShift} disabled={shiftStartBusy} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-4 text-lg font-black uppercase tracking-[0.06em] text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
            {shiftStartBusy ? "Iniciando..." : "INICIAR TURNO"}
          </button>
          {parkingOptions.length ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-600">Turnos programados</p>
              {parkingOptions.map((option) => (
                <button
                  key={option.shiftId}
                  type="button"
                  onClick={() => void startProgrammedShift(option.shiftId)}
                  disabled={shiftStartBusy}
                  className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl bg-emerald-700 px-4 py-3 text-left text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-base font-black uppercase tracking-[0.04em]">{shiftStartBusy ? "Iniciando..." : `Iniciar turno · ${option.parkingName || option.parkingCode}`}</span>
                  <span className="text-xs font-semibold text-emerald-50">Código {option.parkingCode || "-"} · Horario {option.scheduledStart || "-"}–{option.scheduledEnd || "-"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {shiftClosed && shiftClosure && currentView !== POS_VIEWS.CIERRE_CAJA ? (
            <button type="button" onClick={() => goToSection(POS_VIEWS.CIERRE_CAJA)} className="mt-4 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100">
              Ver último cierre de caja
            </button>
          ) : null}
          {volverButton}
        </section>
      );
    }

    if (shiftState === "PARKING_SELECTION_REQUIRED") {
      return (
        <section className="rounded-3xl border border-sky-300 bg-white p-5 text-slate-800 shadow-sm">
          {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
          <div className="mt-4 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-sky-700">Selecciona estacionamiento</p>
            <p className="mt-1 font-black">Tienes más de un estacionamiento asignado.</p>
            <p className="mt-1 text-sm font-semibold">
              {parkingOptions.length || onDemandParkings.length
                ? "Elige el turno que vas a iniciar. El estacionamiento quedará fijo hasta cerrar el turno."
                : "No tienes turnos programados hoy. Contacta a tu supervisor."}
            </p>
          </div>
          {!parkingOptions.length && onDemandParkings.length ? (
            <div className="mt-4 space-y-3">
              {onDemandParkings.map((option) => (
                <button
                  key={option.parkingId}
                  type="button"
                  onClick={() => void startOnDemandShift(option.parkingId)}
                  disabled={shiftStartBusy}
                  className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl bg-emerald-700 px-4 py-3 text-left text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-base font-black uppercase tracking-[0.04em]">{shiftStartBusy ? "Iniciando..." : `Iniciar turno · ${option.parkingName || option.parkingCode}`}</span>
                  <span className="text-xs font-semibold text-emerald-50">Código {option.parkingCode || "-"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {parkingOptions.length ? (
            <div className="mt-4 space-y-3">
              {parkingOptions.map((option) => (
                <button
                  key={option.shiftId}
                  type="button"
                  onClick={() => void startProgrammedShift(option.shiftId)}
                  disabled={shiftStartBusy}
                  className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl bg-emerald-700 px-4 py-3 text-left text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-base font-black uppercase tracking-[0.04em]">{shiftStartBusy ? "Iniciando..." : `Iniciar turno · ${option.parkingName || option.parkingCode}`}</span>
                  <span className="text-xs font-semibold text-emerald-50">Código {option.parkingCode || "-"} · Horario {option.scheduledStart || "-"}–{option.scheduledEnd || "-"}</span>
                </button>
              ))}
            </div>
          ) : null}
          {volverButton}
        </section>
      );
    }

    if (shiftState === "PROGRAMMED") {
      return (
        <section className="rounded-3xl border border-sky-300 bg-white p-5 text-slate-800 shadow-sm">
          {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
          <div className="mt-4 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-sky-700">Turno programado</p>
            <p className="mt-1 font-black">Tienes un turno programado pendiente de inicio.</p>
            <p className="mt-1 text-sm font-semibold">Fecha: {shift?.date || "-"} · Horario: {shift?.scheduledStart || "-"}–{shift?.scheduledEnd || "-"}</p>
          </div>
          <button type="button" onClick={() => void startProgrammedShift()} disabled={shiftStartBusy} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-4 text-lg font-black uppercase tracking-[0.06em] text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
            {shiftStartBusy ? "Iniciando..." : "INICIAR TURNO"}
          </button>
          {volverButton}
        </section>
      );
    }

    if (shiftState === "OPEN" && shift?.status === "CLOSING") {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            El turno está en proceso de cierre. Espera a que se confirme el cierre de caja antes de continuar.
          </div>
          {volverButton}
        </section>
      );
    }

    if (shiftState === "CLOSED") {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Tu turno de hoy en este estacionamiento ya fue cerrado.
          </div>
          <button type="button" onClick={() => void startOnDemandShift()} disabled={shiftStartBusy} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-4 text-lg font-black uppercase tracking-[0.06em] text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
            {shiftStartBusy ? "Iniciando..." : "INICIAR NUEVO TURNO"}
          </button>
          {volverButton}
        </section>
      );
    }

    // UNASSIGNED (sin turno programado hoy para este estacionamiento) o
    // cualquier otro estado no contemplado explícitamente: bloquear.
    return (
      <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
        {title ? <h2 className="text-xl font-black uppercase tracking-[0.08em]">{title}</h2> : null}
        <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          No tienes un turno programado para este estacionamiento.
          {parking ? " Puedes iniciar tu turno ahora." : ""}
        </div>
        {parking ? (
          <button type="button" onClick={() => void startOnDemandShift()} disabled={shiftStartBusy} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-4 text-lg font-black uppercase tracking-[0.06em] text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
            {shiftStartBusy ? "Iniciando..." : "INICIAR TURNO"}
          </button>
        ) : null}
        {volverButton}
      </section>
    );
  }

  function renderHomePanel() {
    // A diferencia del gate de INGRESO/SALIDA (que reemplaza el panel
    // completo), en HOME el aviso de turno se muestra junto a los botones:
    // VEHÍCULOS EN EL PARKING y CÓDIGO QR siguen disponibles porque son
    // consulta, y por eso no hay "Volver" (ya estamos en HOME).
    const homeShiftGate = renderShiftGate("Inicio de turno", { hideVolver: true });
    return (
      <section className="pos-home-panel mx-auto w-full max-w-4xl">
        {/* Una sola línea (QA PRO2 2026-10-18): reemplaza «Turno activo» + el aviso
            el aviso de turno restaurado, que repetían el mismo dato. */}
        {shiftReadyForOperations ? (
          <div role="status" className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-emerald-800">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="truncate">Sesión activa{parking?.name ? <> · <span className="normal-case">{parking.name}</span></> : null}</span>
          </div>
        ) : null}

        {tuuPendingNotice ? (
          <div role="status" className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">
            <span>{tuuPendingNotice}</span>
            <button type="button" onClick={() => setTuuPendingNotice("")} className="min-h-9 shrink-0 rounded-lg border border-emerald-400 bg-white px-3 text-xs font-black uppercase text-emerald-900">Cerrar</button>
          </div>
        ) : null}

        <TuuPendingPaymentsAlert count={tuuPendingViews.length} onOpen={() => goToSection(POS_VIEWS.PAGOS_POR_RESOLVER)} />

        {homeShiftGate ? <div className="mb-4">{homeShiftGate}</div> : null}

        <div className="pos-home-actions grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={openEntryForm}
            disabled={!shiftReadyForOperations}
            aria-disabled={!shiftReadyForOperations}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.05em] text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            INGRESO
          </button>

          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.SALIDA)}
            disabled={!shiftReadyForOperations}
            aria-disabled={!shiftReadyForOperations}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-rose-600 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.05em] text-white shadow-lg shadow-rose-200 transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          >
            SALIDA
          </button>

          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.VEHICULOS)}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-rose-900 px-4 py-4 text-center text-base font-black uppercase tracking-[0.05em] text-white shadow-lg shadow-rose-200 transition hover:bg-rose-800 sm:text-lg"
          >
            VEHÍCULOS EN EL PARKING
          </button>

          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.QR)}
            className="flex min-h-[clamp(6.6rem,18vh,10rem)] w-full items-center justify-center rounded-2xl bg-amber-500 px-4 py-4 text-center text-lg font-black uppercase tracking-[0.05em] text-slate-900 shadow-lg shadow-amber-200 transition hover:bg-amber-400"
          >
            CÓDIGO QR
          </button>
        </div>
        <PosHomeVehicles
          key={parking?.id || "no-parking"}
          stays={activeStays}
          capacity={parking?.configuredCapacity}
          onSelect={(stay) => { setVehicleListOrigin(POS_VIEWS.HOME); void openVehicleDetail(stay); }}
          formatEntry={formatEntryDate}
          formatPlate={formatTicketPlate}
        />
      </section>
    );
  }

  // Fase 2 — Entrada V2. Tres pasos dentro de un solo <form>:
  // PLATE (escribir / leer con cámara / dictar) -> CONFIRM (CONFIRMAR o
  // CORREGIR, obligatorio para toda fuente) -> PHOTO (solo si la foto no
  // está DISABLED). Ningún paso registra por sí solo salvo CONFIRMAR con
  // foto DISABLED o REGISTRAR INGRESO en el paso de foto, ambos vía
  // submitEntry.
  function renderEntryV2Form() {
    const displayPlate = formatTicketPlate(entryPlate) || "—";
    const busy = entrySubmitting || ocrBusy || voiceState === "CHECKING" || voiceState === "INSTALLING";
    const alreadyInside = entryStep !== "PLATE" && isPlateAlreadyInside(entryPlate, activeStays);
    const sourceLabel = entryPlateSource === PLATE_SOURCES.OCR ? "Leída con cámara" : entryPlateSource === PLATE_SOURCES.VOICE ? "Dictada por voz" : "Ingresada manualmente";
    const canReuseOcrPhoto = Boolean(ocrPhoto) && (platePhotoGpsMode !== "REQUIRED" || (ocrPhoto?.latitude != null && ocrPhoto?.longitude != null));
    const stepLabel = entryStep === "PLATE" ? "Paso 1 de 3 · Patente" : entryStep === "CONFIRM" ? "Paso 2 de 3 · Confirmar" : "Paso 3 de 3 · Fotografía";
    const errorIsDuplicate = entryErrorCode === "VEHICLE_ALREADY_INSIDE";

    return (
      <form onSubmit={handleEntryFormSubmit} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Ingreso · {stepLabel}</p>
            <h2 className="mt-1 text-xl font-black text-slate-800">Registrar vehículo</h2>
            <p className="mt-1 text-sm text-slate-600">Se usará el estacionamiento asignado a tu sesión. La hora oficial la registra el servidor.</p>
          </div>
          <button
            type="button"
            onClick={closeEntryForm}
            disabled={entrySubmitting}
            className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>

        {entryStep === "PLATE" ? (
          <div className="mt-5">
            <PosPlateInput value={entryPlate} onChange={(value) => {
              setEntryPlate(formatPosPlateInput(value));
              if (entryError) clearEntryFailure();
            }} disabled={busy} invalid={entryErrorCode === "INVALID_PLATE"} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Formato: CXPY-93 o AB-1234</p>
              {entryPlate ? (
                <button type="button" onClick={() => { setEntryPlate(""); clearEntryFailure(); }} disabled={busy} className="min-h-11 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-white">
                  Borrar
                </button>
              ) : null}
            </div>

            {entryPhoto?.previewUrl ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-300 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: local, no optimizable */}
                <img src={entryPhoto.previewUrl} alt="Foto de la patente" className="block h-auto w-full" />
                <p className="bg-emerald-50 px-3 py-1 text-center text-xs font-black uppercase tracking-wide text-emerald-800">Foto tomada · escribe la patente</p>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              {/* "Tomar foto": foto de evidencia con el marco de patente (sin
                  OCR). Se usa al confirmar, sin volver a pedirla. El OCR
                  (handleOcrCapture) queda en el código sin botón que lo abra. */}
              {platePhotoMode !== "DISABLED" ? (
                <button
                  type="button"
                  onClick={() => { clearEntryFailure(); setPhotoCaptureOpen(true); }}
                  disabled={busy || voiceState === "LISTENING"}
                  className="min-h-16 rounded-2xl border border-sky-300 bg-sky-50 px-3 py-3 text-base font-black uppercase tracking-[0.04em] text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {entryPhoto ? "Repetir foto" : "Tomar foto"}
                </button>
              ) : platePhotoUnavailableMessage(platePhotoStatus) ? (
                // La opción depende de la configuración del estacionamiento
                // activo: en lugar de desaparecer sin explicación, se informa.
                <p role="note" className="flex min-h-16 items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold leading-snug text-slate-600">
                  {platePhotoUnavailableMessage(platePhotoStatus)}
                </p>
              ) : <span />}
              {voiceState === "LISTENING" ? (
                <button
                  type="button"
                  onClick={cancelVoiceCapture}
                  className="min-h-16 rounded-2xl border border-rose-300 bg-rose-50 px-3 py-3 text-base font-black uppercase tracking-[0.04em] text-rose-800"
                  aria-live="polite"
                >
                  Escuchando… Cancelar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startVoiceCapture()}
                  disabled={busy}
                  className="min-h-16 rounded-2xl border border-violet-300 bg-violet-50 px-3 py-3 text-base font-black uppercase tracking-[0.04em] text-violet-900 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {voiceState === "CHECKING" ? "Verificando micrófono..." : voiceState === "INSTALLING" ? "Instalando voz..." : "Dictar patente"}
                </button>
              )}
            </div>

            {voiceInstallLang ? (
              <button
                type="button"
                onClick={() => void installVoiceModel()}
                disabled={busy}
                className="mt-3 min-h-11 w-full rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-bold text-violet-800 disabled:opacity-60"
              >
                Instalar reconocimiento de voz local ({voiceInstallLang})
              </button>
            ) : null}
          </div>
        ) : null}

        {entryStep === "CONFIRM" || entryStep === "PHOTO" ? (
          <div className="mt-5 rounded-2xl border-2 border-emerald-300 bg-white p-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              {entryStep === "CONFIRM" ? "Patente detectada / ingresada" : "Patente confirmada"}
            </p>
            <p className="mt-2 text-4xl font-black tracking-[0.18em] text-slate-900">{displayPlate}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{sourceLabel}</p>
            {entryReleased?.released ? (
              <div className="mt-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-950" role="status">
                <p className="text-base font-black uppercase tracking-wide">Patente liberada</p>
                <p>Foto obligatoria · ocupa un cupo liberado{entryReleased.spots?.total ? ` (${entryReleased.spots.used} de ${entryReleased.spots.total} en uso)` : ""}.</p>
                {entryReleased.authorization?.beneficiaryName ? <p>Beneficiario: {entryReleased.authorization.beneficiaryName}</p> : null}
                {entryReleased.authorization?.description ? <p className="text-xs">{entryReleased.authorization.description}</p> : null}
                <p className="text-xs">Fuera del horario autorizado se cobra la tarifa normal.</p>
              </div>
            ) : entryReleased && entryReleased.decision !== "NOT_AUTHORIZED" ? (
              <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2 text-left text-sm font-semibold text-amber-950" role="alert">
                <p className="font-black uppercase tracking-wide">Pago liberado no aplica</p>
                <p>{entryReleased.message}</p>
                <p className="text-xs">Presiona CONFIRMAR para ingresar con cobro normal.</p>
              </div>
            ) : null}
            {entryProposalNotice && entryStep === "CONFIRM" ? (
              <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${entryPlateSource !== PLATE_SOURCES.MANUAL && entryProposalNotice === entryErrorMessage("OCR_LOW_CONFIDENCE") ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700"}`}>
                {entryProposalNotice}
              </p>
            ) : null}
          </div>
        ) : null}

        {alreadyInside ? (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="font-black uppercase tracking-wide">Vehículo ya ingresado</p>
            <p className="mt-1 text-sm font-semibold">Esta patente figura dentro del estacionamiento. Revisa la patente o búscala en SALIDA.</p>
            <button type="button" onClick={() => void loadTerminalState(true)} className="mt-2 min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm font-bold text-amber-900">
              Actualizar lista
            </button>
          </div>
        ) : null}

        {entryStep === "PHOTO" && (platePhotoMode !== "DISABLED" || entryReleased?.released) ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-700">
                Fotografía de patente {platePhotoMode === "REQUIRED" || entryReleased?.released ? "(obligatoria)" : "(opcional)"}
              </span>
              {entryPhoto ? <span className="text-xs font-black uppercase text-emerald-600">Lista</span> : null}
            </div>

            {entryPhoto ? (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={entryPhoto.previewUrl}
                  alt={`Fotografía de la patente ${displayPlate}`}
                  className="h-20 w-28 rounded-xl border border-slate-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPhotoCaptureOpen(true)}
                  disabled={entrySubmitting}
                  className="min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cambiar foto
                </button>
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {canReuseOcrPhoto ? (
                  <button
                    type="button"
                    onClick={() => capturedPlatePhoto(ocrPhoto)}
                    className="min-h-12 w-full rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900"
                  >
                    Usar la foto de la lectura
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPhotoCaptureOpen(true)}
                  className="min-h-12 w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
                >
                  Tomar fotografía
                </button>
              </div>
            )}
          </div>
        ) : null}

        {entryError ? (
          <div
            role="alert"
            className={`mt-4 rounded-2xl border p-4 text-sm font-semibold ${errorIsDuplicate ? "border-amber-300 bg-amber-50 text-amber-950" : "border-rose-300 bg-rose-50 text-rose-700"}`}
          >
            {entryError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {entryStep === "PLATE" ? (
            <button
              type="submit"
              disabled={busy || voiceState === "LISTENING"}
              className="min-h-16 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continuar
            </button>
          ) : null}

          {entryStep === "CONFIRM" ? (
            <>
              <button
                type="submit"
                disabled={entrySubmitting || alreadyInside}
                className="min-h-16 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entrySubmitting ? "Registrando..." : "CONFIRMAR"}
              </button>
              <button
                type="button"
                onClick={correctEntryPlate}
                disabled={entrySubmitting}
                className="min-h-16 rounded-2xl border border-slate-300 bg-white px-4 py-4 text-lg font-black text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                CORREGIR
              </button>
            </>
          ) : null}

          {entryStep === "PHOTO" ? (
            <>
              <button
                type="submit"
                disabled={entrySubmitting || alreadyInside || ((platePhotoMode === "REQUIRED" || entryReleased?.released) && !entryPhoto)}
                className="min-h-16 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entrySubmitting ? "Registrando..." : entryPhoto || platePhotoMode === "REQUIRED" || entryReleased?.released ? "REGISTRAR INGRESO" : "REGISTRAR SIN FOTO"}
              </button>
              <button
                type="button"
                onClick={correctEntryPlate}
                disabled={entrySubmitting}
                className="min-h-16 rounded-2xl border border-slate-300 bg-white px-4 py-4 text-lg font-black text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                CORREGIR PATENTE
              </button>
            </>
          ) : null}
        </div>
      </form>
    );
  }

  function renderIngresoPanel() {
    // El gate no debe ocultar la confirmación de un ingreso ya registrado
    // (p. ej. si el turno cambió de estado justo después de confirmar).
    if (!entrySuccess) {
      const gate = renderShiftGate("Ingreso de vehículo");
      if (gate) return gate;
    }

    if (entrySuccess) {
      return (
        <article className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
          <DebtNoticeBanner notice={entrySuccess.debtNotice} />
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Ingreso registrado</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Patente</p>
              <p className="mt-1 text-lg font-black">{entrySuccess.stay?.license_plate || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ticket / operación</p>
              <p className="mt-1 text-lg font-black">{entrySuccess.stay?.code || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Fecha de ingreso</p>
              <p className="mt-1 font-bold">{formatEntryDate(entrySuccess.stay?.entry_at).date}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Hora de ingreso</p>
              <p className="mt-1 font-bold">{formatEntryDate(entrySuccess.stay?.entry_at).time}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Estacionamiento</p>
              <p className="mt-1 font-bold">{entrySuccess.parking?.name || parking?.name || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Operador</p>
              <p className="mt-1 font-bold">{entrySuccess.stay?.entry_operator_name || formatOperatorDisplayName(context)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Empresa</p>
              <p className="mt-1 font-bold">{entrySuccess.parking?.company?.business_name || entrySuccess.parking?.company_name || "-"}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">QR</p>
              <p className="mt-1 break-all font-mono text-sm font-bold">{entrySuccess.stay?.qr_token || "-"}</p>
            </div>
            {platePhotoMode !== "DISABLED" ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Fotografía de patente</p>
                <p className="mt-1 font-bold">{entryPhotoForPrint ? "Capturada" : "No capturada"}</p>
              </div>
            ) : null}
          </div>

          {entryPrintStatus ? (
            <div className="mt-4 whitespace-pre-line rounded-2xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-800">
              {entryPrintStatus}
            </div>
          ) : null}

          {entryPrintPayload ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void printLastEntryTicket(entryPrintPayload)}
                disabled={entryPrintBusy}
                className="rounded-2xl border border-emerald-400 bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-900 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entryPrintBusy ? "Reimprimiendo..." : "REIMPRIMIR TICKET"}
              </button>
            </div>
          ) : null}
        </article>
      );
    }

    if (entryOpen) {
      return renderEntryV2Form();
    }

    return (
      <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Ingreso de vehículo</h2>
        <p className="mt-2 text-sm font-semibold">Selecciona comenzar para registrar un ingreso nuevo.</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={openEntryForm}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
          >
            Comenzar ingreso
          </button>
          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.HOME)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            Volver
          </button>
        </div>
      </section>
    );
  }

  function renderVehiclesPreparedList() {
    if (!activeStays.length) {
      return (
        <div className="rounded-2xl border border-dashed border-rose-300 bg-white p-4 text-sm font-semibold text-rose-900">
          No hay vehículos para mostrar en este momento.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="hidden rounded-2xl border border-rose-200 bg-white md:block">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-rose-100">
              <tr>
                <th className="rounded-tl-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Patente</th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Hora ingreso</th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Minutos consumidos</th>
                <th className="rounded-tr-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-rose-900">Monto actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rose-100">
              {activeStays.map((stay, index) => {
                const entry = formatEntryDate(stay?.entry_at);
                return (
                  <tr
                    key={String(stay?.id || stay?.code || stay?.qr_token || `stay-${index}`)}
                    onClick={() => void openVehicleDetail(stay)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openVehicleDetail(stay);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir detalle de ${stay?.license_plate || "vehículo"}`}
                    className="cursor-pointer bg-white transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-inset"
                  >
                    <td className="px-3 py-3 font-black text-rose-950">{stay?.license_plate || "-"}{stay?.releasedPayment ? <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">Liberada</span> : null}</td>
                    <td className="px-3 py-3 font-semibold text-rose-900">{entry.time}</td>
                    <td className="px-3 py-3 font-semibold text-rose-900">{formatMinuteCount(stay?.quote)}</td>
                    <td className="px-3 py-3 font-black text-rose-950">{formatQuoteAmount(stay?.quote)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {activeStays.map((stay, index) => {
            const entry = formatEntryDate(stay?.entry_at);
            return (
              <button
                key={String(stay?.id || stay?.code || stay?.qr_token || `stay-${index}`)}
                type="button"
                onClick={() => void openVehicleDetail(stay)}
                  className="rounded-2xl border border-rose-200 bg-white p-4 text-left shadow-sm transition hover:border-rose-400 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Patente</p>
                    <p className="mt-1 text-xl font-black text-rose-950">{stay?.license_plate || "-"}</p>
                    {stay?.releasedPayment ? <span className="mt-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">Liberada</span> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Monto</p>
                    <p className="mt-1 text-lg font-black text-rose-950">{formatQuoteAmount(stay?.quote)}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-700">Ingreso</p>
                    <p className="mt-1 font-semibold text-rose-900">{entry.time}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-rose-700">Minutos</p>
                    <p className="mt-1 font-semibold text-rose-900">{formatMinuteCount(stay?.quote)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderPagosDelDiaPanel() {
    if (paymentsTodayLoading && !paymentsToday.length) {
      return (
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-700" />
            <p className="text-sm font-semibold">Cargando pagos del día...</p>
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Pagos del día</h2>
        <p className="mt-2 text-sm font-semibold">Pagos confirmados hoy en el estacionamiento asignado.</p>

        {paymentsTodayError ? (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {paymentsTodayError}
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total pagos del día</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalAmount ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total efectivo</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalCash ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total débito</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalDebit ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Total crédito</p>
                <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(paymentsTodayTotals?.totalCredit ?? 0)}</p>
              </div>
              {Number(paymentsTodayTotals?.totalUnclassifiedCard) > 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-600">Tarjeta sin clasificar</p><p className="mt-1 text-lg font-black">{formatCurrency(paymentsTodayTotals.totalUnclassifiedCard)}</p></div> : null}
            </div>

            <button
              type="button"
              onClick={() => void printPaymentsDay()}
              disabled={paymentsDayPrintBusy || paymentsTodayLoading}
              className="mt-4 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {paymentsDayPrintBusy ? "Imprimiendo..." : "Imprimir pagos del día"}
            </button>
            {paymentsDayPrintStatus ? (
              <div className="mt-3 whitespace-pre-line rounded-2xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-800">{paymentsDayPrintStatus}</div>
            ) : null}

            <div className="mt-4 space-y-3">
              {!paymentsToday.length ? (
                <div className="rounded-2xl border border-dashed border-emerald-300 bg-white p-4 text-sm font-semibold text-emerald-900">
                  Todavía no hay pagos confirmados hoy en este estacionamiento.
                </div>
              ) : (
                <>
                  <div className="hidden rounded-2xl border border-emerald-200 bg-white md:block">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <thead className="bg-emerald-100">
                        <tr>
                          <th className="rounded-tl-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Patente</th>
                          <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Hora</th>
                          <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Medio de pago</th>
                          <th className="rounded-tr-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-emerald-900">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100">
                        {paymentsToday.map((payment, index) => (
                          <tr key={String(payment?.id || payment?.paymentCode || `payment-${index}`)} className="bg-white">
                            <td className="px-3 py-3 font-black text-emerald-950">{payment?.plate || "-"}</td>
                            <td className="px-3 py-3 font-semibold text-emerald-900">{payment?.time || "-"}</td>
                            <td className="px-3 py-3 font-semibold text-emerald-900">{formatPaymentMethodLabel(payment?.paymentMethod)}</td>
                            <td className="px-3 py-3 font-black text-emerald-950">{formatCurrency(payment?.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:hidden">
                    {paymentsToday.map((payment, index) => (
                      <div
                        key={String(payment?.id || payment?.paymentCode || `payment-${index}`)}
                        className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Patente</p>
                            <p className="mt-1 text-xl font-black text-emerald-950">{payment?.plate || "-"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Monto</p>
                            <p className="mt-1 text-lg font-black text-emerald-950">{formatCurrency(payment?.amount)}</p>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl bg-emerald-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Hora</p>
                            <p className="mt-1 font-semibold text-emerald-900">{payment?.time || "-"}</p>
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Medio de pago</p>
                            <p className="mt-1 font-semibold text-emerald-900">{formatPaymentMethodLabel(payment?.paymentMethod)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.HOME)}
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
          >
            Volver
          </button>
        </div>
      </section>
    );
  }

  // Totales compartidos por la vista previa (turno abierto) y el cierre ya
  // persistido (turno cerrado) — mismo componente visual, una sola vez.
  function renderClosureTotals(totals) {
    const differenceKnown = Number.isFinite(Number(totals.cashDifference));
    const differenceLabel = differenceKnown
      ? `${totals.cashDifference > 0 ? "+" : ""}${formatCurrency(totals.cashDifference)}`
      : "—";

    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Operaciones</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Pagos confirmados</p>
              <p className="mt-1 text-lg font-black text-slate-900">{totals.confirmedPaymentsCount ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Pagos anulados</p>
              <p className="mt-1 text-lg font-black text-slate-900">{totals.cancelledPaymentsCount ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Total operaciones</p>
              <p className="mt-1 text-lg font-black text-slate-900">{(totals.confirmedPaymentsCount ?? 0) + (totals.cancelledPaymentsCount ?? 0)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Recaudación por medio de pago</p>
          <div className="mt-3 grid gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:flex-col sm:items-start">
              <span>Efectivo</span><span className="font-black text-slate-900">{formatCurrency(totals.cashAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:flex-col sm:items-start">
              <span>Débito</span><span className="font-black text-slate-900">{formatCurrency(totals.debitAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:flex-col sm:items-start">
              <span>Crédito</span><span className="font-black text-slate-900">{formatCurrency(totals.creditAmount)}</span>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm font-semibold text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span>Recaudación bruta</span><span className="font-black text-slate-900">{formatCurrency(totals.grossAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Pagos anulados</span><span className="font-black text-rose-700">-{formatCurrency(totals.cancelledAmount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-300 pt-2">
              <span className="text-sm font-black uppercase tracking-[0.06em] text-slate-900">Total neto del turno</span>
              <span className="text-2xl font-black text-slate-900">{formatCurrency(totals.netAmount)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Cuadre de efectivo</p>
          <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span>Efectivo según sistema</span><span className="font-black text-slate-900">{formatCurrency(totals.cashAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Efectivo declarado por operador</span><span className="font-black text-slate-900">{formatCurrency(totals.declaredCashAmount)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Diferencia</span>
              <span className={`font-black ${totals.cashDifference ? "text-rose-700" : "text-slate-900"}`}>{differenceLabel}</span>
            </div>
          </div>
          {totals.differenceObservation ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-900">Observación: {totals.differenceObservation}</p>
          ) : null}
        </div>
      </div>
    );
  }

  // Lista de vehículos pendientes — mismo formato para la vista previa
  // (preview.pendingVehicles) y el snapshot ya congelado del cierre
  // (closure.pendingVehiclesSnapshot). Estos vehículos siguen OPEN: esta
  // lista es solo constancia, no cierra ni cobra nada.
  function renderPendingVehiclesList(vehicles) {
    const list = Array.isArray(vehicles) ? vehicles : [];
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Vehículos pendientes ({list.length})</p>
        {!list.length ? (
          <p className="mt-2 text-sm font-semibold text-slate-600">No hay vehículos pendientes al momento del cierre.</p>
        ) : (
          <>
            <div className="mt-3 hidden md:block">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="rounded-tl-xl px-3 py-2 text-left text-xs font-black uppercase tracking-[0.06em] text-slate-600">Patente</th>
                    <th className="px-3 py-2 text-left text-xs font-black uppercase tracking-[0.06em] text-slate-600">Ticket</th>
                    <th className="px-3 py-2 text-left text-xs font-black uppercase tracking-[0.06em] text-slate-600">Hora ingreso</th>
                    <th className="rounded-tr-xl px-3 py-2 text-left text-xs font-black uppercase tracking-[0.06em] text-slate-600">Minutos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((vehicle, index) => {
                    const entryParts = formatBridgeEntryDateTime(vehicle.entryAt);
                    return (
                      <tr key={String(vehicle.stayId || `pending-${index}`)}>
                        <td className="px-3 py-2 font-black text-slate-900">{vehicle.plate || "-"}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{vehicle.ticket || "-"}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{entryParts?.entryTime || "-"}</td>
                        <td className="px-3 py-2 font-semibold text-slate-700">{Number.isFinite(vehicle.elapsedMinutes) ? vehicle.elapsedMinutes : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid gap-2 md:hidden">
              {list.map((vehicle, index) => {
                const entryParts = formatBridgeEntryDateTime(vehicle.entryAt);
                return (
                  <div key={String(vehicle.stayId || `pending-card-${index}`)} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black text-slate-900">{vehicle.plate || "-"}</span>
                      <span className="text-xs font-bold text-slate-600">{entryParts?.entryTime || "-"}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>Ticket: {vehicle.ticket || "-"}</span>
                      <span>{Number.isFinite(vehicle.elapsedMinutes) ? `${vehicle.elapsedMinutes} min` : "-"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderShiftPrintPrompt() {
    if (!closureReceiptStatus) {
      return (
        <div className="rounded-2xl border border-slate-300 bg-white p-4">
          <p className="text-base font-black text-slate-900">¿DESEA IMPRIMIR EL CIERRE?</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void confirmClosurePrint()}
              disabled={closureReceiptBusy}
              className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closureReceiptBusy ? "Imprimiendo..." : "SÍ"}
            </button>
            <button
              type="button"
              onClick={declineClosurePrint}
              disabled={closureReceiptBusy}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              NO
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="whitespace-pre-line text-sm font-semibold text-amber-900">{closureReceiptStatus}</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void confirmClosurePrint()}
            disabled={closureReceiptBusy}
            className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {closureReceiptBusy ? "Imprimiendo..." : "REINTENTAR IMPRESIÓN"}
          </button>
          <button
            type="button"
            onClick={declineClosurePrint}
            disabled={closureReceiptBusy}
            className="rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            FINALIZAR
          </button>
        </div>
      </div>
    );
  }

  function renderClosedShiftSummary() {
    const closure = shiftClosure;
    if (!closure) return null;

    return (
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <p className="text-sm font-black uppercase tracking-[0.1em] text-emerald-700">
            {closurePrintPrompt ? "Cierre de caja registrado" : "Turno cerrado"}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-800">Folio: {closure.folio || "-"}</p>
        </div>

        {renderClosureTotals(closure)}
        {renderPendingVehiclesList(closure.pendingVehiclesSnapshot)}
        <ClosedUnpaidExitsSummary summary={closedUnpaidExits} />

        {closurePrintPrompt ? (
          renderShiftPrintPrompt()
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <button
              type="button"
              onClick={reprintShiftClosure}
              disabled={closureReceiptBusy}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {closureReceiptBusy ? "Imprimiendo..." : "REIMPRIMIR CIERRE"}
            </button>
            {closureReceiptStatus ? (
              <p className="mt-2 whitespace-pre-line text-sm font-semibold text-amber-800">{closureReceiptStatus}</p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  function renderOpenShiftClosureForm() {
    const preview = shiftPreview;
    if (!preview) return null;

    const hasDeclaredInput = declaredCashInput !== "";
    const declaredValue = hasDeclaredInput ? Number(declaredCashInput) : null;
    const liveDifference = hasDeclaredInput && Number.isFinite(declaredValue) ? Math.round(declaredValue) - Math.round(preview.cashAmount) : null;
    const requiresObservation = liveDifference !== null && liveDifference !== 0;
    const canConfirm = hasDeclaredInput && Number.isFinite(declaredValue) && declaredValue >= 0 && (!requiresObservation || differenceObservationInput.trim());

    const displayTotals = {
      ...preview,
      declaredCashAmount: hasDeclaredInput ? declaredValue : 0,
      cashDifference: liveDifference ?? 0,
      differenceObservation: differenceObservationInput,
    };

    return (
      <div className="mt-4 space-y-4">
        {renderClosureTotals(displayTotals)}
        {renderPendingVehiclesList(preview.pendingVehicles)}
        <UnpaidExitsReview
          rows={preview.unpaidExits}
          onSessionExpired={() => redirectToPosLogin("sesion-expirada")}
          onChanged={() => { void loadShiftState(); void loadTerminalState(true); }}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="block text-sm font-bold text-slate-700">
            Efectivo declarado por operador
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={declaredCashInput}
              onChange={(event) => setDeclaredCashInput(event.target.value)}
              placeholder="0"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-black text-slate-900 outline-none focus:border-emerald-500"
            />
          </label>

          {requiresObservation ? (
            <label className="mt-4 block text-sm font-bold text-slate-700">
              Observación de diferencia <span className="text-rose-600">*</span>
              <textarea
                value={differenceObservationInput}
                onChange={(event) => setDifferenceObservationInput(event.target.value)}
                rows={3}
                placeholder="Explica la diferencia de caja..."
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
              />
            </label>
          ) : null}
        </div>

        {closeError ? (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{closeError}</div>
        ) : null}

        {!closeConfirmOpen ? (
          <button
            type="button"
            onClick={openCloseConfirm}
            disabled={!canConfirm}
            className="w-full rounded-2xl bg-rose-900 px-4 py-4 text-lg font-black uppercase tracking-[0.06em] text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            CONFIRMAR CIERRE
          </button>
        ) : (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4">
            <p className="text-base font-black text-rose-950">¿CONFIRMA EL CIERRE DE CAJA?</p>
            <p className="mt-1 text-xs font-semibold text-rose-800">Esta acción no se puede deshacer.</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void confirmShiftClosure()}
                disabled={closeSubmitting || !canConfirm}
                className="rounded-xl bg-rose-900 px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {closeSubmitting ? "Cerrando..." : "SÍ, CERRAR TURNO"}
              </button>
              <button
                type="button"
                onClick={cancelCloseConfirm}
                disabled={closeSubmitting}
                className="rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-rose-900 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                CANCELAR
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCierreCajaPanel() {
    if (shiftLoading && !shift) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-slate-600" />
            <p className="text-sm font-semibold">Cargando turno del operador...</p>
          </div>
        </section>
      );
    }

    if (shiftError) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Cierre de caja</h2>
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{shiftError}</div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    // Selector Off Street: sin estacionamiento activo, el último cierre de
    // hoy se sigue mostrando (con REIMPRIMIR CIERRE); al continuar se vuelve
    // al selector.
    const showsLastClosure = shiftState === "PARKING_SELECTION_REQUIRED" && shiftClosed && Boolean(shiftClosure) && Boolean(shift);
    if (shiftState === "PARKING_SELECTION_REQUIRED" && !showsLastClosure) {
      return renderShiftGate("Cierre de caja");
    }
    const closureParking = parking || lastClosedParking;

    if (shiftState === "UNASSIGNED" || !shift) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Cierre de caja</h2>
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            No tienes un turno asignado para hoy en este estacionamiento.
          </div>
          <button type="button" onClick={() => goToSection(POS_VIEWS.HOME)} className="mt-4 rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100">Volver</button>
        </section>
      );
    }

    if (shiftState === "PROGRAMMED") {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Cierre de caja</h2>
          <div className="mt-4 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
            <p className="font-black">Turno programado disponible</p>
            <p className="mt-1 text-sm font-semibold">Fecha: {shift.date || "-"} · Horario: {shift.scheduledStart || "-"}–{shift.scheduledEnd || "-"}</p>
          </div>
          <button type="button" onClick={() => void startProgrammedShift()} disabled={shiftStartBusy} className="mt-4 w-full rounded-2xl bg-emerald-700 px-4 py-4 text-lg font-black uppercase tracking-[0.06em] text-white hover:bg-emerald-600 disabled:opacity-60">
            {shiftStartBusy ? "Iniciando..." : "Iniciar turno"}
          </button>
          <button type="button" onClick={() => goToSection(POS_VIEWS.HOME)} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100">Volver</button>
        </section>
      );
    }

    const operatorFullName = formatOperatorDisplayName(context);
    const companyName = context?.membership?.company?.business_name || context?.membership?.company?.trade_name || "-";
    const openedParts = formatBridgeEntryDateTime(shift.openedAt);
    const nowParts = formatBridgeEntryDateTime(shiftServerNow || new Date().toISOString());
    const shiftLabel = shift.id ? shift.id.slice(0, 8).toUpperCase() : "-";

    return (
      <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Cierre de caja</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">Resumen del turno del operador</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Nombre completo</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-800">{operatorFullName}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Usuario / correo</p>
            <p className="mt-1 break-all text-sm font-bold text-slate-800">{extractDisplayUsername(context?.email) || "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Empresa</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-800">{companyName}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Estacionamiento</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{closureParking?.name || "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Código</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{closureParking?.code || "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Turno</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{shiftLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Fecha del turno</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{openedParts?.entryDate || "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Hora inicio</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{openedParts?.entryTime || "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Hora actual de cierre</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{nowParts?.entryTime || "-"}</p>
          </div>
        </div>

        {shiftClosed ? renderClosedShiftSummary() : renderOpenShiftClosureForm()}

        <div className="mt-4">
          <button
            type="button"
            onClick={() => goToSection(POS_VIEWS.HOME)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            {showsLastClosure ? "Continuar" : "Volver"}
          </button>
        </div>
      </section>
    );
  }

  // Reutiliza activeStays (misma fuente que "VEHÍCULOS EN EL PARKING",
  // cargada en loadTerminalState desde /api/pos/stays) — no arma otra
  // consulta. Solo cambian las columnas mostradas (patente/hora/minutos/
  // ticket, sin monto) para calzar con el listado imprimible.
  function renderImprimirListadoList() {
    if (!activeStays.length) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">
          No hay vehículos para mostrar en este momento.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="hidden rounded-2xl border border-slate-200 bg-white md:block">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="rounded-tl-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-600">Patente</th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-600">Hora de ingreso</th>
                <th className="px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-600">Minutos transcurridos</th>
                <th className="rounded-tr-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-600">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeStays.map((stay, index) => {
                const entry = formatEntryDate(stay?.entry_at);
                return (
                  <tr key={String(stay?.id || stay?.code || `listado-${index}`)} className="bg-white">
                    <td className="px-3 py-3 font-black text-slate-900">{stay?.license_plate || "-"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{entry.time}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{formatMinuteCount(stay?.quote)}</td>
                    <td className="px-3 py-3 font-semibold text-slate-700">{stay?.code || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {activeStays.map((stay, index) => {
            const entry = formatEntryDate(stay?.entry_at);
            return (
              <div key={String(stay?.id || stay?.code || `listado-card-${index}`)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Patente</p>
                    <p className="mt-1 text-xl font-black text-slate-900">{stay?.license_plate || "-"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Ticket</p>
                    <p className="mt-1 text-sm font-bold text-slate-700">{stay?.code || "-"}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Ingreso</p>
                    <p className="mt-1 font-semibold text-slate-700">{entry.time}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Minutos</p>
                    <p className="mt-1 font-semibold text-slate-700">{formatMinuteCount(stay?.quote)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderImprimirListadoPanel() {
    return (
      <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Vehículos en el parking</h2>
        <p className="mt-2 text-sm font-bold">Total vehículos dentro: {vehiclesInside}</p>

        <div className="mt-4">{renderImprimirListadoList()}</div>

        {listadoPrintPrompt ? (
          <div className="mt-4 rounded-2xl border border-slate-300 bg-white p-4">
            {!listadoPrintStatus ? (
              <>
                <p className="text-base font-black text-slate-900">¿DESEA IMPRIMIR EL LISTADO?</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void confirmListadoPrint()}
                    disabled={listadoPrintBusy}
                    className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {listadoPrintBusy ? "Imprimiendo..." : "SÍ"}
                  </button>
                  <button
                    type="button"
                    onClick={declineListadoPrint}
                    disabled={listadoPrintBusy}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    NO
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-line text-sm font-semibold text-amber-900">{listadoPrintStatus}</p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={declineListadoPrint}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100"
                  >
                    VOLVER
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={openListadoPrintPrompt}
              disabled={!activeStays.length}
              className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              Imprimir listado
            </button>
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        )}
      </section>
    );
  }

  function renderVehicleDetailPanel() {
    if (selectedVehicleLoading && !selectedVehicle) {
      return (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <div className="flex items-center gap-3">
            <LoaderCircle className="h-5 w-5 animate-spin text-rose-700" />
            <p className="text-sm font-semibold">Calculando el monto a pagar...</p>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(vehicleListOrigin)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"
            >
              VOLVER
            </button>
          </div>
        </section>
      );
    }

    const stay = selectedVehicle?.stay;
    const quote = selectedVehicle?.quote;
    const quoteView = normalizeQuoteView(quote);
    const entry = formatEntryDate(stay?.entry_at);
    const tariffName = quoteView?.rateName || stay?.rate_name || "Sin tarifa vigente";
    const amount = formatQuoteAmount(quote);
    // PAGAR solo puede habilitarse con un total numérico real — nunca solo
    // porque el campo de "bloqueado" no vino marcado explícitamente. Evita
    // que un total vacío/"—" quede acompañado de un botón habilitado.
    const hasPayableQuote = Boolean(quoteView) && quoteView.payable && quoteView.total !== null;
    // Mismo desglose Neto/IVA que ya usa el modal de pago (getTaxBreakdown
    // sobre el TOTAL que ya calculó el backend, nunca recalculado aparte).
    const detailBreakdown = hasPayableQuote ? getTaxBreakdown(quoteView.total) : null;
    const releasedView = quoteView?.released || null;
    const releasedNoCharge = Boolean(quoteView?.releasedNoCharge);
    const couponView = hasPayableQuote ? couponViewFromQuote(quote) : null;
    // Leer QR Descuento encima de PAGAR: no aplica a Pago liberado ni con un pago con tarjeta sin cerrar.
    const detailCouponVisible = couponsEnabled && hasPayableQuote && !quote?.released && !releasedNoCharge && !pendingTuuPaymentFor(stay?.id);

    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
        <h2 className="text-xl font-black uppercase tracking-[0.08em]">Vehículo seleccionado</h2>
        <div className="mt-4 grid gap-4 rounded-2xl border border-rose-200 bg-white p-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Patente</p>
            <p className="mt-1 text-2xl font-black text-rose-950">{stay?.license_plate || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Ticket</p>
            <p className="mt-1 font-bold text-rose-900">{stay?.code || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Ingreso</p>
            <p className="mt-1 font-bold text-rose-900">{entry.date} {entry.time}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Tiempo consumido</p>
            <p className="mt-1 font-bold text-rose-900">{formatMinuteCount(quote)} minutos</p>
          </div>
          {releasedView ? (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">
              <p className="text-base font-black uppercase tracking-wide">Patente liberada</p>
              <p>Tiempo liberado: {releasedView.coveredMinutes} min · fuera de la autorización: {releasedView.chargeableMinutes} min.</p>
              <p className="text-xs">{releasedNoCharge ? "Sin excedente: la salida no tiene cobro y libera el cupo." : "Se cobra solo el tiempo fuera de la autorización, con la tarifa del estacionamiento."}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Tarifa aplicada</p>
            <p className="mt-1 font-bold text-rose-900">{releasedNoCharge ? "Pago liberado" : tariffName}</p>
          </div>
          <ChargeBreakdownList breakdown={hasPayableQuote ? quote?.snapshot?.chargeBreakdown : null} />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">TOTAL A PAGAR</p>
            {detailBreakdown ? (
              <div className="mt-1 space-y-1">
                {renderCouponLines(couponView, { text: "text-rose-800", strong: "text-rose-950" })}
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-rose-800">
                  <span>Neto</span>
                  <span className="font-bold text-rose-950">{formatCurrency(detailBreakdown.netAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm font-semibold text-rose-800">
                  <span>IVA (19%)</span>
                  <span className="font-bold text-rose-950">{formatCurrency(detailBreakdown.vatAmount)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 border-t border-rose-200 pt-1">
                  <span className="text-xs font-black uppercase tracking-[0.06em] text-rose-900">Total</span>
                  <span className="text-2xl font-black text-rose-950">{formatCurrency(detailBreakdown.totalAmount)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-3xl font-black text-rose-950">{releasedNoCharge ? formatCurrency(0) : amount}</p>
            )}
          </div>
          {selectedVehicleError ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {selectedVehicleError}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          {releasedNoCharge ? (
            <button
              type="button"
              onClick={() => void registerReleasedExit()}
              disabled={selectedVehicleLoading || releasedExitBusy}
              className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              {releasedExitBusy ? "Registrando..." : "REGISTRAR SALIDA SIN COBRO"}
            </button>
          ) : (
            <div className="flex flex-col gap-2 sm:w-80">
              {detailCouponVisible ? renderCouponPanel(couponView) : null}
              <button
                type="button"
                onClick={openPaymentModal}
                disabled={selectedVehicleLoading || !hasPayableQuote || couponBusy}
                className="rounded-xl bg-rose-900 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
              >
                {couponBusy ? "VALIDANDO CUPÓN..." : "PAGAR"}
              </button>
            </div>
          )}
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            {releasedNoCharge ? "Patente liberada sin excedente." : hasPayableQuote ? (isZeroTotalCouponCharge(quote) ? "El cupón cubre el total: la salida es sin cargo." : "Preparado para seleccionar medio de pago.") : "No existe una tarifa activa para esta estadía."}
          </div>
          <UnpaidExitAction
            stay={stay}
            disabled={selectedVehicleLoading || !stay?.id}
            onSessionExpired={() => redirectToPosLogin("sesion-expirada")}
            onDone={() => {
              setUnpaidFlash(`Salida sin pago registrada: ${stay?.license_plate || ""}. El cupo quedó libre; el monto se calculará al cierre del turno.`);
              setSelectedVehicle(null);
              goToSection(vehicleListOrigin);
              void loadTerminalState(true);
              void loadShiftState();
            }}
          />
          <button
            type="button"
            onClick={() => goToSection(vehicleListOrigin)}
            className="rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-rose-800 hover:bg-rose-100"
          >
            VOLVER
          </button>
        </div>
      </section>
    );
  }

  // TUU-02: pago TUU sin cerrar del ticket (aprobado pendiente de registro o
  // con resultado incierto), de este equipo o informado por el servidor.
  function pendingTuuPaymentFor(stayId) {
    return findTuuPendingPayment(
      mergeTuuPendingViews(tuuPendingPayments, [...serverCardAttempts, ...(selectedVehicle?.cardPaymentAttempt ? [selectedVehicle.cardPaymentAttempt] : [])], { deviceId: getKnownPosDeviceIds() }),
      stayId,
    );
  }

  // Subtotal, cupón con su beneficio y descuento, tal como vienen en el cálculo firmado.
  function renderCouponLines(couponView, { text, strong }) {
    if (!couponView) return null;
    return (
      <>
        {couponView.subtotal !== null ? (
          <div className={`flex items-center justify-between gap-3 text-sm font-semibold ${text}`}>
            <span>Subtotal</span>
            <span className={`font-bold ${strong}`}>{formatCurrency(couponView.subtotal)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-emerald-700">
          <span>Cupón {couponView.code}{couponView.benefit ? ` · ${couponView.benefit}` : ""}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-emerald-700">
          <span>Descuento</span>
          <span className="font-bold">-{formatCurrency(couponView.discount)}</span>
        </div>
      </>
    );
  }

  // Leer QR Descuento (SOL-2026-10-19-002): el detalle del vehículo (encima de
  // PAGAR) y la ventana de pago comparten estado y acciones. El código escrito
  // queda como respaldo; sin escáner nativo (navegador) es la única opción.
  function renderCouponPanel(couponView) {
    const native = usesNativeQrScanner();
    const showCodeForm = couponEntryOpen || !native;
    return (
      <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
        {couponView ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-emerald-900">CUPÓN {couponView.code} APLICADO</p>
            <button type="button" onClick={removeCoupon} disabled={couponBusy} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.06em] text-emerald-900 disabled:opacity-60">
              QUITAR CUPÓN
            </button>
          </div>
        ) : null}
        {native ? (
          <button type="button" onClick={scanCouponQr} disabled={couponBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black tracking-[0.04em] text-white transition hover:bg-emerald-600 disabled:opacity-60">
            {couponBusy ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <QrCode className="h-5 w-5" aria-hidden="true" />}
            Leer QR Descuento
          </button>
        ) : null}
        {showCodeForm ? (
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); applyCouponCode(couponCodeInput); }}>
            <input
              value={couponCodeInput}
              onChange={(event) => setCouponCodeInput(event.target.value.toUpperCase())}
              // Con el teclado abierto (adjustResize) el campo y APLICAR quedan a la vista.
              onFocus={(event) => { const field = event.currentTarget; window.setTimeout(() => field.scrollIntoView({ block: "center" }), 300); }}
              placeholder="Código (4 caracteres)"
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-emerald-300 bg-white px-3 py-2 font-mono text-sm font-bold tracking-wider text-slate-900"
              aria-label="Código del cupón"
            />
            <button type="submit" disabled={couponBusy || !couponCodeInput.trim()} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black uppercase tracking-[0.06em] text-white disabled:opacity-60">
              {couponBusy ? "..." : "APLICAR"}
            </button>
          </form>
        ) : null}
        {native ? (
          <button type="button" onClick={() => { setCouponEntryOpen(!couponEntryOpen); setCouponCodeInput(""); setCouponMessage(null); }} disabled={couponBusy} className="text-xs font-bold text-emerald-900 underline disabled:opacity-60">
            {couponEntryOpen ? "Cancelar código" : "Escribir código del cupón"}
          </button>
        ) : null}
        {couponMessage ? <p role="status" className={`text-xs font-semibold ${couponMessage.type === "error" ? "text-rose-700" : "text-emerald-800"}`}>{couponMessage.text}</p> : null}
      </div>
    );
  }

  function renderPaymentModal() {
    if (!paymentModalOpen || !selectedVehicle) return null;

    const stay = selectedVehicle.stay;
    const quote = selectedVehicle.quote;
    const quoteView = normalizeQuoteView(quote);
    // TUU-02: pago TUU sin cerrar de este ticket (aprobado pendiente de
    // registro o con resultado incierto). Mientras exista, el modal NO
    // ofrece ningún medio de pago. No se muestra durante un pago en curso.
    const tuuPendingForStay = paymentSubmitting ? null : pendingTuuPaymentFor(stay?.id);
    // Desglose Neto/IVA a partir del TOTAL que ya cotizó el backend — ver
    // getTaxBreakdown. El pago confirmado más abajo (paymentBreakdown) usa
    // el total que confirmó el backend en la respuesta del EXIT, no este
    // valor pre-pago.
    const quoteBreakdown = quoteView?.payable && quoteView.total !== null ? getTaxBreakdown(quoteView.total) : null;
    const paymentBreakdown = paymentResult ? getTaxBreakdown(paymentResult.total) : null;
    const couponView = couponViewFromQuote(quote);
    // Cupones: no aplican a Pago liberado (regla del servidor) ni con un pago con tarjeta pendiente.
    const couponControlsVisible = couponsEnabled && quoteView?.payable && !quote?.released && paymentStep === "MENU";
    // Total $0 por el cupón: salida sin cargo confirmada (efectivo $0), nunca TUU.
    const zeroTotalCoupon = isZeroTotalCouponCharge(quote);

    return (
      // Alto máximo = pantalla y contenido desplazable (QA PRO2 2026-10-18,
      // SOL-2026-10-11-001): el aviso de pago incierto superaba el alto de la
      // pantalla y dejaba fuera de vista la X y CERRAR, sin forma de llegar a ellos.
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/55 p-2 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closePaymentModal(); }}>
        <section className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" style={{ maxHeight: "calc(100vh - 1rem)" }}>
          <header className="flex shrink-0 items-center justify-between bg-rose-900 px-5 py-4 text-white">
            <div>
              <p className="text-xs font-semibold text-rose-200">Pago operacional</p>
              <h3 className="mt-1 text-xl font-black">Seleccione medio de pago</h3>
            </div>
            <button type="button" onClick={closePaymentModal} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar pago">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Patente</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{stay?.license_plate || "-"}</p>
              {quoteBreakdown ? (
                <div className="mt-3 space-y-1">
                  {renderCouponLines(couponView, { text: "text-slate-700", strong: "text-slate-900" })}
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                    <span>Neto</span>
                    <span className="font-bold text-slate-900">{formatCurrency(quoteBreakdown.netAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                    <span>IVA (19%)</span>
                    <span className="font-bold text-slate-900">{formatCurrency(quoteBreakdown.vatAmount)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-300 pt-2">
                    <span className="text-sm font-black uppercase tracking-[0.06em] text-slate-900">Total a pagar</span>
                    <span className="text-2xl font-black text-slate-900">{formatCurrency(quoteBreakdown.totalAmount)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-700">Total a pagar: <span className="font-black text-slate-900">{formatQuoteAmount(quote)}</span></p>
              )}
            </div>

            {couponControlsVisible && !tuuPendingForStay ? renderCouponPanel(couponView) : null}

            {paymentStep === "MENU" && tuuPendingForStay ? (
              <TuuPendingPaymentCard
                key={`${tuuPendingForStay.stayId}:${tuuPendingForStay.status}`}
                record={tuuPendingForStay}
                busy={tuuPendingBusy}
                message={tuuPendingMessage}
                onRegister={() => void registerPendingTuuPayment(tuuPendingForStay)}
                onRefresh={(stayId) => void refreshTuuPendingStatus(stayId)}
                onClose={closePaymentModal}
              />
            ) : null}

            {paymentStep === "MENU" && !tuuPendingForStay && zeroTotalCoupon ? (
              <button type="button" onClick={() => handlePaymentSelection("CASH")} disabled={couponBusy} className="min-h-20 w-full rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                SALIDA SIN CARGO (CUPÓN)
              </button>
            ) : null}

            {paymentStep === "MENU" && !tuuPendingForStay && !zeroTotalCoupon ? (
              <div className={`grid gap-3 ${cardPaymentsEnabled ? "sm:grid-cols-3" : ""}`}>
                <button type="button" onClick={() => handlePaymentSelection("CASH")} disabled={couponBusy} className="min-h-20 rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                  EFECTIVO
                </button>
                {cardPaymentsEnabled ? (
                  <>
                    <button type="button" onClick={() => void handleCardPaymentSelection(TUU_METHOD.DEBIT)} disabled={couponBusy} className="min-h-20 rounded-2xl bg-sky-600 px-4 py-5 text-lg font-black text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                      DÉBITO
                    </button>
                    <button type="button" onClick={() => void handleCardPaymentSelection(TUU_METHOD.CREDIT)} disabled={couponBusy} className="min-h-20 rounded-2xl bg-indigo-600 px-4 py-5 text-lg font-black text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                      CRÉDITO
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {paymentStep === "CASH_CONFIRM" ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-lg font-black text-emerald-950">{zeroTotalCoupon ? "¿CONFIRMA SALIDA SIN CARGO?" : "¿CONFIRMA PAGO EN EFECTIVO?"}</p>
                {zeroTotalCoupon ? <p className="text-sm font-semibold text-emerald-900">El cupón cubre el total. Se registra la salida con $0 y el cupón queda utilizado.</p> : null}
                <div className="grid gap-2 text-sm font-semibold text-emerald-950 sm:grid-cols-2">
                  <div><span className="block text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Patente</span>{stay?.license_plate || "-"}</div>
                  <div><span className="block text-xs font-black uppercase tracking-[0.08em] text-emerald-700">Total</span>{formatQuoteAmount(quote)}</div>
                </div>
                {paymentMessage ? <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-rose-700">{paymentMessage}</p> : null}
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void confirmCashPayment()}
                    disabled={paymentSubmitting}
                    className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {paymentSubmitting ? "Procesando..." : zeroTotalCoupon ? "CONFIRMAR SALIDA SIN CARGO" : "CONFIRMAR PAGO"}
                  </button>
                  <button type="button" onClick={() => setPaymentStep("MENU")} disabled={paymentSubmitting} className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">
                    CANCELAR
                  </button>
                </div>
              </div>
            ) : null}

            {/*
              El pago YA está confirmado y la permanencia YA está cerrada
              antes de llegar a este paso (confirmCashPayment ya resolvió
              /api/data-entry e intentó imprimir automáticamente). Solo se
              llega aquí cuando esa impresión automática falló — este panel
              es exclusivamente recuperación de la impresión, nunca vuelve a
              cobrar, cerrar la permanencia ni genera una nueva operación.
            */}
            {paymentStep === "PRINT_PROMPT" ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="rounded-xl border border-emerald-300 bg-white px-3 py-3 text-sm font-black text-emerald-900">
                  PAGO REGISTRADO ({formatPaymentMethodLabel(paymentResult?.paymentMethod)}{paymentResult?.cardLast4 ? ` ****${paymentResult.cardLast4}` : ""})<br />SALIDA COMPLETADA
                  <div className="mt-2 text-xs font-semibold text-emerald-800">Patente: {paymentResult?.plate || "-"}</div>
                  {paymentResult?.boleta?.status === "ISSUED" ? (
                    <div className="mt-2 text-xs font-semibold text-emerald-800">
                      Boleta electrónica N° {paymentResult.boleta.folio ?? "-"}{paymentResult.boleta.environment === "TEST" ? " (prueba)" : ""}
                      {paymentResult.boleta.stampPngBase64 ? <img alt="Timbre electrónico" src={`data:image/png;base64,${paymentResult.boleta.stampPngBase64}`} className="mt-2 w-full max-w-xs bg-white" /> : null}
                    </div>
                  ) : paymentResult?.boleta ? (
                    <div className="mt-2 text-xs font-semibold text-amber-800">{paymentResult.boleta.message}</div>
                  ) : null}
                  {paymentBreakdown ? (
                    <div className="mt-3 space-y-1 border-t border-emerald-200 pt-2">
                      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-emerald-800">
                        <span>Neto</span>
                        <span className="font-bold text-emerald-900">{formatCurrency(paymentBreakdown.netAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-emerald-800">
                        <span>IVA (19%)</span>
                        <span className="font-bold text-emerald-900">{formatCurrency(paymentBreakdown.vatAmount)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-xs font-black uppercase tracking-[0.06em] text-emerald-900">Total pagado</span>
                        <span className="text-xl font-black text-emerald-950">{formatCurrency(paymentBreakdown.totalAmount)}</span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="whitespace-pre-line rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
                  {receiptPrintStatus || "No fue posible imprimir el ticket."}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void confirmReceiptPrint()}
                    disabled={receiptPrintBusy}
                    className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {receiptPrintBusy ? "Imprimiendo..." : "REINTENTAR IMPRESIÓN"}
                  </button>
                  <button
                    type="button"
                    onClick={declineReceiptPrint}
                    disabled={receiptPrintBusy}
                    className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    FINALIZAR
                  </button>
                </div>
              </div>
            ) : null}

            {/*
              PROCESSING/APPROVED son transitorios: TUU está cobrando o ya
              cobró y se está registrando la salida (mismo criterio que
              EFECTIVO, que tampoco tiene una pantalla intermedia de
              "aprobado" -- va directo a PRINT_PROMPT o al cierre del flujo).
              Los demás son estados terminales que sí requieren una acción
              del operador.
            */}
            {paymentStep === "CARD_PAYMENT" ? (
              <div className={`space-y-4 rounded-2xl border p-4 ${
                cardPaymentStatus === "ERROR"
                  ? "border-red-300 bg-red-50"
                  : cardPaymentStatus === "DECLINED"
                    ? "border-amber-300 bg-amber-50"
                    : "border-sky-200 bg-sky-50"
              }`}>
                {cardPaymentStatus === "PROCESSING" || cardPaymentStatus === "APPROVED" ? (
                  <div className="flex items-center gap-3">
                    <LoaderCircle className="h-5 w-5 animate-spin text-sky-700" />
                    <p className="text-lg font-black text-sky-950">{cardPaymentMessage || "Procesando pago..."}</p>
                  </div>
                ) : (
                  <p className={`text-lg font-black ${cardPaymentStatus === "ERROR" ? "text-red-950" : "text-sky-950"}`}>
                    {cardPaymentStatus === "DECLINED" && "PAGO RECHAZADO"}
                    {cardPaymentStatus === "CANCELLED" && "PAGO CANCELADO"}
                    {cardPaymentStatus === "NOT_INSTALLED" && "TUU NO ESTÁ INSTALADA"}
                    {cardPaymentStatus === "ERROR" && "NO SE INICIÓ EL PAGO"}
                    {cardPaymentMessage ? <span className="mt-2 block text-sm font-semibold">{cardPaymentMessage}</span> : null}
                  </p>
                )}

                {cardPaymentStatus && cardPaymentStatus !== "PROCESSING" && cardPaymentStatus !== "APPROVED" ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {/*
                      REINTENTAR solo existe en estados donde consta que TUU
                      no cobró (rechazado, cancelado, TUU no instalada o no se
                      pudo abrir). Un resultado incierto o un pago aprobado
                      nunca pasan por aquí: se muestran con
                      TuuPendingPaymentCard, sin opción de volver a cobrar.
                    */}
                    <button
                      type="button"
                      onClick={() => { setPaymentStep("MENU"); setCardPaymentStatus(""); setCardPaymentMessage(""); }}
                      className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-sky-600"
                    >
                      REINTENTAR
                    </button>
                    <button type="button" onClick={closePaymentModal} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100">
                      CERRAR
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {paymentStep === "MENU" && !tuuPendingForStay ? (
              <button type="button" onClick={closePaymentModal} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100">
                VOLVER
              </button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  // Pagos por resolver: lista completa de pagos con tarjeta sin cerrar y su
  // detalle (registrar un aprobado, consultar estado). Nunca abre TUU.
  function renderPagosPorResolverPanel() {
    const record = paymentSubmitting ? null : findTuuPendingPayment(tuuPendingViews, tuuPendingViewStayId);
    return (
      <section className="mx-auto w-full max-w-4xl space-y-4">
        <h2 className="text-xl font-black uppercase tracking-[0.08em] text-slate-800">Pagos por resolver</h2>
        {tuuPendingViews.length ? (
          <TuuPendingPaymentsBanner records={tuuPendingViews} onOpen={(stayId) => { setTuuPendingMessage(""); setTuuPendingViewStayId(stayId); }} />
        ) : (
          <p className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">No hay pagos con tarjeta por resolver.</p>
        )}
        {record ? (
          <TuuPendingPaymentCard
            key={`${record.stayId}:${record.status}`}
            record={record}
            busy={tuuPendingBusy}
            message={tuuPendingMessage}
            onRegister={() => void registerPendingTuuPayment(record)}
            onRefresh={(stayId) => void refreshTuuPendingStatus(stayId)}
            onClose={() => setTuuPendingViewStayId(null)}
          />
        ) : null}
        <button type="button" onClick={() => goToSection(POS_VIEWS.HOME)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black uppercase tracking-[0.08em] text-slate-800 hover:bg-slate-100">
          VOLVER AL INICIO
        </button>
      </section>
    );
  }

  function renderOperationalPanel() {
    if (currentView === POS_VIEWS.VEHICULO_DETALLE) {
      return renderVehicleDetailPanel();
    }

    // SALIDA: búsqueda por patente, exclusiva de la salida/cobro. Nunca
    // lista automáticamente todas las permanencias abiertas — eso es
    // exclusivo de "Vehículos en el parking" (rama separada más abajo).
    // INICIO DE TURNO (menú): sin turno abierto muestra la misma pantalla de
    // turno que HOME (iniciar programado o a pedido); con turno abierto, su detalle.
    if (currentView === POS_VIEWS.TURNO) {
      const gate = renderShiftGate("Inicio de turno");
      if (gate) return gate;
      const opened = formatEntryDate(shift?.openedAt);
      return (
        <section className="rounded-3xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Turno activo</h2>
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-4 text-sm font-semibold">
            <p>Estacionamiento: <span className="font-black">{parking?.name || "-"}</span></p>
            <p className="mt-1">Inicio: <span className="font-black">{opened.date} {opened.time}</span></p>
            <p className="mt-1">Vehículos dentro: <span className="font-black">{vehiclesInside}</span></p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => goToSection(POS_VIEWS.HOME)} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-white hover:bg-emerald-600">
              Ir al inicio
            </button>
            <button type="button" onClick={() => goToSection(POS_VIEWS.CIERRE_CAJA)} className="rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.06em] text-emerald-900 hover:bg-emerald-100">
              Cierre de caja
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.SALIDA) {
      // El gate de turno aplica: requiere turno OPEN para cobrar.
      const gate = renderShiftGate("Salida de vehículo");
      if (gate) return gate;

      return (
        <section className="rounded-3xl border border-rose-300 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Salida de vehículo</h2>
          <p className="mt-2 text-sm font-semibold">Ingresa la patente del vehículo que va a salir y pulsa Buscar.</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                value={salidaPlate}
                onChange={(event) => {
                  const formatted = formatPosPlateInput(event.target.value);
                  setSalidaPlate(formatted);
                  setSalidaSearchStatus(null);
                  setSalidaSuggestionsOpen(Boolean(formatted));
                }}
                onFocus={() => {
                  if (salidaPlate) setSalidaSuggestionsOpen(true);
                }}
                onBlur={() => {
                  // Retraso breve: el blur del input dispara antes que el
                  // click de una sugerencia, así que se cierra el
                  // desplegable después de dar tiempo a que el click se
                  // registre (si no, la lista desaparece antes del onClick).
                  window.setTimeout(() => setSalidaSuggestionsOpen(false), 150);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setSalidaSuggestionsOpen(false);
                    searchSalidaPlate();
                  }
                  if (event.key === "Escape") {
                    setSalidaSuggestionsOpen(false);
                  }
                }}
                placeholder="CXPY-93"
                className="w-full rounded-xl border border-rose-300 bg-white px-4 py-3 text-lg font-black uppercase tracking-widest text-rose-950 focus:border-rose-500 focus:outline-none"
              />
              {salidaSuggestionsOpen && salidaSuggestions.length > 0 ? (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-rose-300 bg-white text-left shadow-lg">
                  {salidaSuggestions.map((stay, index) => (
                    <li key={stay?.id || `${stay?.license_plate}-${index}`}>
                      <button
                        type="button"
                        onClick={() => selectSalidaSuggestion(stay)}
                        className="block w-full px-4 py-2 text-left text-base font-black uppercase tracking-widest text-rose-950 hover:bg-rose-100"
                      >
                        {formatPosPlateInput(stay?.license_plate)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              onClick={searchSalidaPlate}
              className="rounded-xl bg-rose-900 px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-800"
            >
              BUSCAR
            </button>
          </div>

          {salidaSearchStatus ? (
            <div
              className={`mt-4 rounded-2xl border p-4 text-sm font-semibold ${
                salidaSearchStatus.type === "conflict"
                  ? "border-red-400 bg-red-50 text-red-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              {salidaSearchStatus.message}
            </div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    // VEHÍCULOS EN EL PARKING: vista de consulta, lista completa de
    // permanencias OPEN. No requiere turno (solo lectura).
    if (currentView === POS_VIEWS.VEHICULOS) {
      return (
        <section className="rounded-3xl border border-rose-300 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Vehículos en el parking</h2>
          <p className="mt-2 text-sm font-semibold">Permanencias OPEN reales del estacionamiento asignado al operador.</p>
          <p className="mt-3 text-sm font-bold">Vehículos actualmente dentro: {vehiclesInside}</p>
          <div className="mt-4 space-y-4">
            {renderVehiclesPreparedList()}
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.QR) {
      // Salida por QR: cobra, así que exige turno OPEN (igual que SALIDA).
      const gate = renderShiftGate("Salida por código QR");
      if (gate) return gate;

      return (
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Salida por código QR</h2>
          <p className="mt-2 text-sm font-semibold">Lee el QR del ticket de entrada: se ubica el vehículo, se calcula el monto y se abre el cobro.</p>

          <div className="mt-4">
            {qrBusy ? (
              <div className="rounded-2xl border border-amber-300 bg-white p-4 text-sm font-bold text-amber-900">Buscando ticket y calculando monto...</div>
            ) : qrExitStatus ? (
              <div className="space-y-3">
                <div
                  className={`rounded-2xl border p-4 text-sm font-semibold ${
                    qrExitStatus.type === "conflict" ? "border-red-400 bg-red-50 text-red-900" : "border-amber-300 bg-white text-amber-900"
                  }`}
                >
                  {qrExitStatus.message}
                </div>
                <button
                  type="button"
                  onClick={() => (usesNativeQrScanner() ? void startNativeQrScan() : restartQrScan())}
                  className="w-full rounded-xl bg-amber-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-amber-800"
                >
                  {usesNativeQrScanner() ? "Escanear QR del ticket" : "Leer otro QR"}
                </button>
              </div>
            ) : usesNativeQrScanner() ? (
              <button
                type="button"
                onClick={() => void startNativeQrScan()}
                className="w-full rounded-xl bg-amber-700 px-4 py-5 text-base font-black uppercase tracking-[0.08em] text-white hover:bg-amber-800"
              >
                Escanear QR del ticket
              </button>
            ) : (
              <QrTicketScanner key={qrScanKey} onDetected={(value) => void handleQrTicket(value)} />
            )}
          </div>

          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void handleQrTicket(qrManualCode);
            }}
          >
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              value={qrManualCode}
              onChange={(event) => setQrManualCode(event.target.value)}
              placeholder="Código del ticket (si el QR no se lee)"
              className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-4 py-3 text-base font-bold uppercase text-amber-950 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={qrBusy}
              className="rounded-xl bg-amber-900 px-6 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-amber-800 disabled:opacity-60"
            >
              BUSCAR
            </button>
          </form>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.BUSCAR) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">{buscarIntent === "reprint" ? "Reimprimir ticket" : "Buscar ticket"}</h2>
          <p className="mt-2 text-sm font-semibold">
            {buscarIntent === "reprint"
              ? "Elige el vehículo cuyo ticket de entrada quieres reimprimir. Puedes filtrar por patente o código."
              : "Busca un vehículo dentro por patente o código de ticket."}
          </p>

          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            value={buscarQuery}
            onChange={(event) => setBuscarQuery(event.target.value)}
            placeholder="Patente o código (ej: CXPY-93)"
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg font-black uppercase tracking-widest text-slate-900 focus:border-slate-500 focus:outline-none"
          />

          {entryPrintStatus ? (
            <div className="mt-3 whitespace-pre-line rounded-2xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-800">{entryPrintStatus}</div>
          ) : null}

          <div className="mt-4 space-y-3">
            {(() => {
              const results = searchActiveStays(activeStays, buscarQuery);
              if (buscarLoading && results.length === 0) {
                return <p className="text-sm font-semibold text-slate-600">Cargando vehículos...</p>;
              }
              if (results.length === 0) {
                return (
                  <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
                    {buscarQuery.trim() ? "No hay vehículos dentro con esa patente o código." : "No hay vehículos dentro del estacionamiento."}
                  </p>
                );
              }
              return results.map((stay) => {
                const entry = formatEntryDate(stay?.entry_at);
                const minutes = Number(stay?.quote?.elapsedMinutes);
                return (
                  <article key={stay.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-lg font-black uppercase tracking-widest text-slate-900">{formatPosPlateInput(stay?.license_plate)}</p>
                    <p className="mt-1 break-all font-mono text-xs font-bold text-slate-600">{stay?.code}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      Entrada: {entry.date} {entry.time}
                      {Number.isFinite(minutes) ? ` · ${minutes} min` : ""}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => reprintStayTicket(stay)}
                        disabled={entryPrintBusy}
                        className="rounded-xl bg-slate-800 px-3 py-3 text-xs font-black uppercase tracking-[0.06em] text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {entryPrintBusy ? "Imprimiendo..." : "Reimprimir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void openVehicleDetail(stay)}
                        className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-3 text-xs font-black uppercase tracking-[0.06em] text-rose-900 hover:bg-rose-100"
                      >
                        Cobrar salida
                      </button>
                    </div>
                  </article>
                );
              });
            })()}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    if (currentView === POS_VIEWS.IMPRIMIR_LISTADO) {
      return renderImprimirListadoPanel();
    }

    if (currentView === POS_VIEWS.PAGOS_DEL_DIA) {
      return renderPagosDelDiaPanel();
    }

    if (currentView === POS_VIEWS.PAGOS_POR_RESOLVER) {
      return renderPagosPorResolverPanel();
    }

    if (currentView === POS_VIEWS.CIERRE_CAJA) {
      return renderCierreCajaPanel();
    }

    if (currentView === POS_VIEWS.ESTADO_DISPOSITIVO) {
      return (
        <section className="rounded-3xl border border-slate-300 bg-slate-50 p-5 text-slate-800 shadow-sm">
          <h2 className="text-xl font-black uppercase tracking-[0.08em]">Estado del dispositivo</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Bridge Android</p>
              <p className="mt-1 text-sm font-black text-slate-800">{nativePrintAvailable ? "Disponible" : "No disponible"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Versión POS</p>
              <p className="mt-1 text-sm font-black text-slate-800">{POS_FRONTEND_VERSION}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dispositivo</p>
              <p className="mt-1 text-sm font-black text-slate-800">{formatDeviceInfoLabel(deviceInfo)}</p>
              {deviceInfo?.androidVersion ? <p className="text-xs text-slate-600">Android {deviceInfo.androidVersion}</p> : null}
              {deviceInfo?.appVersion ? <p className="text-xs text-slate-600">App {deviceInfo.appVersion}{deviceInfo.runtimeVersion ? ` · runtime ${deviceInfo.runtimeVersion}` : ""}</p> : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Identificador de terminal</p>
              <p className="mt-1 text-sm font-black text-slate-800">No registrado</p>
              <p className="text-xs text-slate-600">Los movimientos quedan asociados al operador y a su turno.</p>
            </div>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => goToSection(POS_VIEWS.HOME)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 min-h-11 text-sm font-bold text-slate-800 hover:bg-slate-100"
            >
              Volver
            </button>
          </div>
        </section>
      );
    }

    return null;
  }

  function renderActiveView() {
    if (currentView === POS_VIEWS.HOME) return renderHomePanel();
    if (currentView === POS_VIEWS.INGRESO) return renderIngresoPanel();
    return renderOperationalPanel();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTerminalState(false);
  }, [loadTerminalState]);

  // El estado del turno se necesita desde HOME (para habilitar/bloquear
  // INGRESO y SALIDA) y no solo al entrar a CIERRE DE CAJA como antes:
  // se carga también al montar el terminal.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShiftState();
  }, [loadShiftState]);

  useEffect(() => {
    // Se detecta después del montaje: leer window.ParkFacilDevice durante el
    // render podría diferir entre SSR y el primer render del cliente (p. ej.
    // en el dispositivo SUNMI, donde el bridge nativo puede quedar disponible
    // antes de que React hidrate).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativePrintAvailable(Boolean(getNativePrinterBridge()));
  }, []);

  // Fase 2 — al salir del terminal se libera el worker del OCR (memoria
  // WASM) y se corta cualquier escucha de voz pendiente.
  useEffect(() => () => {
    void releasePlateOcr();
  }, []);

  // Corta la escucha si el controlador se reemplaza o el terminal se desmonta.
  useEffect(() => () => {
    voiceController?.cancel();
  }, [voiceController]);

  // Fase 1 — identificación del dispositivo (best-effort, mismo
  // getDeviceInfo() que ya usa la evidencia de patente). Solo se muestra en
  // ESTADO DEL DISPOSITIVO; no existe todavía un ID persistente de terminal.
  useEffect(() => {
    let cancelled = false;
    void collectDeviceInfoForEntry().then((info) => {
      if (!cancelled) setDeviceInfo(info || null);
    }).catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  // Fase TUU-02 — al abrir el POS se recuperan los pagos TUU sin cerrar
  // guardados en el equipo (un intento que quedó "en curso" pasa a resultado
  // incierto) y se instala el receptor permanente del resultado de TUU, de
  // modo que una respuesta tardía también se capture tras recargar la app.
  useEffect(() => {
    let cancelled = false;
    tuuResultRouter.install(window);
    Promise.resolve().then(() => {
      if (cancelled) return;
      const recovered = recoverTuuPendingPayments(getTuuPendingStorage());
      setTuuPendingPayments(recovered);
      for (const record of recovered) logTuu("RECOVERED_AFTER_RESTART", record, { status: record.status });
      // El servidor es la fuente de verdad: intentos activos del estacionamiento
      // (también los de otros equipos) y avisos que quedaron en cola.
      void refreshServerCardAttemptsRef.current?.();
      // APK 0.4.0+: resultados guardados en el equipo que la web aún no confirmó.
      void syncNativeTuuStateRef.current?.();
    });
    // Al volver a primer plano (p. ej. después de TUU) se vuelve a consultar.
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNativeTuuStateRef.current?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // El receptor usa siempre la versión vigente de handleLateTuuResult.
  useEffect(() => {
    tuuResultRouter.setLateResultHandler((result) => void handleLateTuuResult(result));
    refreshServerCardAttemptsRef.current = refreshServerCardAttempts;
    syncNativeTuuStateRef.current = syncNativeTuuState;
  });

  // Fase 1 — una operación en curso (cobro, ingreso, cierre, inicio de
  // turno) nunca se interrumpe con una redirección por revalidación.
  useEffect(() => {
    operationBusyRef.current = paymentSubmitting || entrySubmitting || closeSubmitting || shiftStartBusy;
  }, [paymentSubmitting, entrySubmitting, closeSubmitting, shiftStartBusy]);

  // Fase 1 — sesión expirada/revocada con el POS abierto: antes solo se
  // detectaba al próximo request. Se revalida periódicamente y al volver a
  // primer plano (p. ej. tras abrir TUU); 401/403 -> login con motivo. Un
  // error de red NO se interpreta como sesión inválida. Además, si el
  // navegador restaura la página desde el back/forward cache (Atrás tras
  // cerrar sesión), se recarga para que el proxy vuelva a validar.
  useEffect(() => {
    let cancelled = false;
    let consecutiveUnauthorized = 0;

    async function revalidateSession() {
      if (cancelled || operationBusyRef.current || cardPaymentLockRef.current) return;
      if (document.visibilityState === "hidden") return;
      try {
        const session = await getSessionContext();
        if (session.ok) {
          consecutiveUnauthorized = 0;
          return;
        }
        const reason = posLoginReasonForSessionStatus(session.status, session.payload?.code);
        if (session.status === 401) {
          consecutiveUnauthorized += 1;
          if (consecutiveUnauthorized < POS_SESSION_UNAUTHORIZED_THRESHOLD) return;
        } else {
          consecutiveUnauthorized = 0;
        }
        if (!cancelled && reason && !operationBusyRef.current && !cardPaymentLockRef.current) redirectToPosLogin(reason);
      } catch {
        // Sin red: se reintenta en el próximo ciclo.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void revalidateSession();
    }

    function onPageShow(event) {
      if (event.persisted) window.location.reload();
    }

    const timer = setInterval(() => void revalidateSession(), POS_SESSION_REVALIDATE_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <main className="pos-terminal min-h-screen bg-slate-100 text-slate-900">
      <PosViewport />
      {unpaidFlash ? (
        <div className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-950" role="status" data-testid="pos-unpaid-flash">
          <span>{unpaidFlash}</span>
          <button type="button" onClick={() => setUnpaidFlash("")} aria-label="Cerrar aviso" className="font-black">×</button>
        </div>
      ) : null}
      {paymentModalOpen ? renderPaymentModal() : null}

      {photoCaptureOpen ? (
        <PlatePhotoCapture
          plate={formatTicketPlate(entryPlate)}
          required={platePhotoMode === "REQUIRED" || Boolean(entryReleased?.released)}
          gpsMode={platePhotoGpsMode}
          onCapture={capturedPlatePhoto}
          onCancel={() => setPhotoCaptureOpen(false)}
        />
      ) : null}

      {/* Fase 2: misma cámara/recorte para LEER la patente (OCR local). La
          imagen es temporal; GPS nunca bloquea la lectura (REQUIRED se
          degrada a OPTIONAL aquí y se vuelve a exigir si la imagen se
          reutiliza como evidencia). Con foto DISABLED no se pide ubicación. */}
      {ocrCaptureOpen ? (
        <PlatePhotoCapture
          purpose="OCR"
          plate=""
          required={false}
          gpsMode={platePhotoMode === "DISABLED" || platePhotoGpsMode === "DISABLED" ? "DISABLED" : "OPTIONAL"}
          onCapture={(photo) => void handleOcrCapture(photo)}
          onCancel={() => setOcrCaptureOpen(false)}
        />
      ) : null}

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-950/45 lg:hidden" onClick={closeSidebar}>
          <aside className="h-full w-[84%] max-w-xs overflow-y-auto border-r border-slate-300 bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Menú POS</p>
              <button type="button" onClick={closeSidebar} aria-label="Cerrar menú" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 p-2 text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              {/* eslint-disable-next-line react-hooks/refs -- onSelect solo corre al tocar el menú (SALIDA por QR llega a openVehicleDetail, que lee selectedStayIdRef después del await) */}
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.onSelect()}
                  className={item.alert ? "min-h-12 w-full rounded-xl border border-amber-400 bg-amber-50 px-3 py-3 text-left text-sm font-black text-amber-950 hover:bg-amber-100" : "min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="pos-terminal-shell mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="hidden w-80 shrink-0 border-r border-slate-300 bg-white p-4 shadow-sm lg:block">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">ParkFacil POS</p>
          <h2 className="mt-2 text-xl font-black text-slate-800">Navegación</h2>
          <div className="mt-4 space-y-2">
            {/* eslint-disable-next-line react-hooks/refs -- igual que en el menú lateral móvil */}
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => item.onSelect()}
                className={item.alert ? "min-h-12 w-full rounded-xl border border-amber-400 bg-amber-50 px-3 py-3 text-left text-sm font-black text-amber-950 hover:bg-amber-100" : "min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Versión {POS_FRONTEND_VERSION}{deviceInfo?.appVersion ? ` · APK ${deviceInfo.appVersion}` : ""}</p>
        </aside>

        <section className="pos-terminal-content min-w-0 flex-1 p-3 sm:p-4 md:p-6">
          <div className={`pos-terminal-card ${currentView === POS_VIEWS.HOME ? "pos-terminal-home" : ""} rounded-3xl border border-slate-300 bg-white p-4 shadow-xl sm:p-5`}>
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">ParkFacil POS</p>
                <h1 className="mt-2 text-xl font-black text-slate-800 sm:text-2xl">Terminal operativo</h1>
                <p className="mt-1 text-sm text-slate-600">Operador y estacionamiento asignado.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openSidebar}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-300 p-2 text-slate-700 lg:hidden"
                  aria-label="Abrir menú"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => void logout()}
                  disabled={loggingOut || paymentSubmitting}
                  aria-label="Cerrar sesión"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {loggingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                  <span className="hidden sm:inline">{loggingOut ? "Cerrando..." : "Cerrar sesión"}</span>
                </button>
              </div>
            </header>

            {loading ? (
              <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Cargando terminal POS...
              </div>
            ) : error ? (
              <div className="mt-5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : (
              <div className="pos-terminal-body mt-5 space-y-4">
                <div className="pos-terminal-context grid gap-3 sm:grid-cols-3">
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Operador</p>
                    <p className="mt-1 break-words text-sm font-bold text-slate-800">{formatOperatorDisplayName(context)}</p>
                    <p className="text-xs text-slate-600">Rol: {formatPosRoleLabel(context?.role)}</p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Estacionamiento activo</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{parking?.name || (parkingSelectionRequired ? "Pendiente de selección" : "Sin asignación")}</p>
                    <p className="text-xs text-slate-600">Código: {parking?.code || "-"}</p>
                    <p className="text-xs text-slate-600">Empresa: {context?.membership?.company?.trade_name || context?.membership?.company?.business_name || "-"}</p>
                  </article>
                </div>

                {renderActiveView()}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void loadTerminalState(true)}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 min-h-11 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Actualizar
                  </button>
                </div>
              </div>
            )}

            <p className="mt-5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              ParkFacil POS · Versión {POS_FRONTEND_VERSION}{deviceInfo?.appVersion ? ` · APK ${deviceInfo.appVersion}` : ""}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
