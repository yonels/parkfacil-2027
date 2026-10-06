"use client";

import PosPlateInput from "@/components/pos/PosPlateInput";
import PosHomeVehicles from "@/components/pos/PosHomeVehicles";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, LogOut, Menu, RefreshCw, X } from "lucide-react";

import PosViewport from "@/components/pos/PosViewport";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { splitChileTaxFromTotal, toOperationalDateTimeParts } from "@/lib/dataEntry.mjs";
import { ticketHeaderData } from "@/lib/dataEntryPresentation.mjs";
import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";
import { extractDisplayUsername } from "@/lib/auth/accessUsernameDomain.mjs";
import { buildPrintableEntryPayload, entryPhotoRequirementMessage, resolvePlatePhotoPrintDecision } from "@/lib/offStreet/offStreetPlatePhoto.mjs";
import { buildAgentEntryTicketPayload } from "@/lib/pos/entryTicketPayload.mjs";
import { photoToTicketRaster } from "@/lib/pos/ticketPhotoRaster.mjs";
import { TUU_METHOD, TUU_PACKAGE_DEV, TUU_RESULT_TIMEOUT_MS, buildTuuPaymentPayload, parseTuuResult } from "@/lib/pos/tuuPayment.mjs";
import PlatePhotoCapture from "@/components/pos/PlatePhotoCapture";
import QrTicketScanner from "@/components/pos/QrTicketScanner";
import { QR_EXIT_STATUS, qrExitMessage, resolveStayFromQr, searchActiveStays } from "@/lib/pos/qrExitCore.mjs";
import { hasNativeQrScanner, scanQrWithNativeScanner } from "@/lib/pos/nativeQrScanner.mjs";
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
function buildPaymentReceiptPayload(stay, quote, parkingResponse, paymentMethod = "CASH") {
  if (!stay || !quote || !parkingResponse) return null;
  const entryDateTime = formatBridgeEntryDateTime(stay.entry_at);
  const exitDateTime = formatBridgeEntryDateTime(stay.exit_at);
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
    rateDescription: String(quote?.rate?.name || stay?.rate_name || "").trim(),
    netAmount: breakdown.netAmount,
    vatAmount: breakdown.vatAmount,
    amount: breakdown.totalAmount,
    paymentMethod,
    paymentId: String(stay?.payment_code || "").trim(),
  };

  if (!payload.companyName || !payload.parkingName || !payload.ticketNumber || !payload.paymentId) {
    return null;
  }

  return payload;
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
// en parkfacil-pos-android). Esta función envuelve ambas partes en una sola
// Promise para que el llamador pueda usar await de principio a fin, con un
// tope defensivo (TUU_RESULT_TIMEOUT_MS) para nunca quedar colgada si TUU no
// responde.
function startTuuPayment(payloadJson) {
  const bridge = getTuuPaymentBridge();
  if (!bridge) {
    return Promise.resolve({
      delivered: false,
      code: "TUU_BRIDGE_UNAVAILABLE",
      message: "Este dispositivo no tiene el bridge de pago TUU disponible.",
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const previousCallback = typeof window !== "undefined" ? window.ParkFacilTuuResult : undefined;

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (typeof window !== "undefined") {
        window.ParkFacilTuuResult = previousCallback;
      }
      resolve(outcome);
    };

    if (typeof window !== "undefined") {
      window.ParkFacilTuuResult = (resultJson) => {
        finish({ delivered: true, result: parseTuuResult(resultJson) });
      };
    }

    timer = setTimeout(() => {
      finish({ delivered: false, code: "NO_RESPONSE", message: "TUU no respondió dentro del tiempo esperado." });
    }, TUU_RESULT_TIMEOUT_MS);

    let ack;
    try {
      const raw = bridge.payWithTuu(payloadJson);
      ack = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      finish({
        delivered: false,
        code: "TUU_BRIDGE_EXCEPTION",
        message: error instanceof Error ? error.message : String(error ?? "Error desconocido"),
      });
      return;
    }

    if (!ack?.ok) {
      finish({
        delivered: false,
        code: ack?.code || "TUU_LAUNCH_FAILED",
        message: ack?.message || "No fue posible iniciar el pago TUU.",
      });
    }
    // Si ack.ok === true, no se resuelve todavía: se espera
    // window.ParkFacilTuuResult(...) o el timeout de arriba.
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

async function getPosVehicleQuote(stayId) {
  const response = await fetch(`/api/pos/stays/${encodeURIComponent(stayId)}/quote`, {
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
  if ("payable" in quote || "amount" in quote) {
    return {
      payable: Boolean(quote.payable),
      total: Number.isFinite(Number(quote.amount)) ? Number(quote.amount) : null,
      rateName: quote.rateName || null,
      elapsedMinutes: Number.isFinite(Number(quote.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
    };
  }
  return {
    payable: !quote.blocked,
    total: Number.isFinite(Number(quote.total)) ? Number(quote.total) : null,
    rateName: quote.rate?.name || null,
    elapsedMinutes: Number.isFinite(Number(quote.elapsedMinutes)) ? Number(quote.elapsedMinutes) : null,
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
  if (method === "CASH") return "EFECTIVO";
  if (method === "CARD") return "TARJETA";
  return method || "-";
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
  // ERROR/CHARGED_NOT_REGISTERED son terminales y se muestran en el modal.
  // cardPaymentLockRef es una guarda SÍNCRONA (a diferencia de paymentSubmitting,
  // que es estado de React y no se actualiza al instante) para impedir un
  // doble clic que dispare dos pagos TUU en paralelo.
  const [cardPaymentStatus, setCardPaymentStatus] = useState("");
  const [cardPaymentMessage, setCardPaymentMessage] = useState("");
  const cardPaymentLockRef = useRef(false);
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
  const [printPlatePhotoOnTicket, setPrintPlatePhotoOnTicket] = useState(false);
  // Ajuste final: GPS configurable por proyecto, mismo enum DISABLED/
  // OPTIONAL/REQUIRED que platePhotoMode (§18/§19 del encargo) -- nunca se
  // solicita ubicación por esta funcionalidad si viene DISABLED.
  const [platePhotoGpsMode, setPlatePhotoGpsMode] = useState("DISABLED");
  const [entryPhoto, setEntryPhoto] = useState(null);
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
      setActiveStays(stays);
      const photoSettings = summary.payload?.data?.platePhotoSettings || null;
      setPlatePhotoMode(photoSettings?.mode || "DISABLED");
      setPrintPlatePhotoOnTicket(Boolean(photoSettings?.printOnTicket));
      setPlatePhotoGpsMode(photoSettings?.gpsMode || "DISABLED");
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
  function resetEntryCapture() {
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
    setEntryConfirmedPlate("");
    setEntryPlateSource(PLATE_SOURCES.MANUAL);
    setEntryProposalNotice("");
    clearEntryFailure();
    setEntryStep("PLATE");
  }

  // CONFIRMAR: fija la patente confirmada. Con foto DISABLED registra de
  // inmediato; si no, pasa al paso de fotografía (REQUIRED u OPTIONAL).
  function confirmEntryPlate() {
    if (entrySubmitting || entrySubmitLockRef.current) return;
    const formatted = formatPosPlateInput(entryPlate);
    if (!POS_PLATE_REGEX.test(formatted)) {
      correctEntryPlate();
      setEntryFailure("INVALID_PLATE");
      return;
    }
    const confirmedPlate = toBackendPlate(formatted);
    setEntryConfirmedPlate(confirmedPlate);
    clearEntryFailure();
    // Foto ya tomada en el paso Patente ("Tomar foto"): registra directo, sin
    // volver a pedirla.
    if (entryPhoto && platePhotoMode !== "DISABLED") {
      void submitEntry(null, confirmedPlate);
      return;
    }
    if (platePhotoMode === "DISABLED") {
      void submitEntry(null, confirmedPlate);
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
    setSelectedVehicle({ stay, quote: stay.quote || null, parking: parking || null, serverNow: stay.serverNow || null });

    try {
      const response = await getPosVehicleQuote(stay.id);
      if (!response.ok) {
        if (response.status === 401) {
          redirectToPosLogin("sesion-expirada");
          return;
        }
        setSelectedVehicleError(response.payload?.error || "No fue posible actualizar la cotización del vehículo.");
        return;
      }

      const detail = response.payload?.data || null;
      setSelectedVehicle(detail);
      return detail;
    } catch {
      setSelectedVehicleError("Error de red al cotizar el vehículo.");
    } finally {
      setSelectedVehicleLoading(false);
    }
  }

  // Salida por QR: siempre con la lista fresca de estadías OPEN del servidor
  // (el ticket pudo emitirse en otro equipo), mismo resolvedor para el QR
  // leído y para el código escrito a mano. Con la estadía ubicada, cotiza y
  // abre directo el cobro cuando la cotización quedó cargada.
  async function handleQrTicket(raw) {
    if (qrBusy) return;
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
      setActiveStays(stays);
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
      setActiveStays(stays);
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
    const refreshedQuote = await getPosVehicleQuote(selectedVehicle.stay.id);
    if (refreshedQuote.ok && refreshedQuote.payload?.data) {
      const detail = refreshedQuote.payload.data;
      setSelectedVehicle(detail);
      const refreshedAmount = normalizeQuoteView(detail?.quote)?.total ?? 0;
      setPaymentStep(targetStep);
      setPaymentMessage(`${reasonPrefix} Nuevo total: ${formatCurrency(refreshedAmount)}. Confirma nuevamente para cobrar.`);
    } else {
      setPaymentMessage("La cotización venció y no se pudo actualizar automáticamente. Vuelve a abrir el detalle del vehículo.");
    }
  }

  async function confirmCashPayment() {
    if (!selectedVehicle?.stay?.id || paymentSubmitting) return;
    const quoteSnapshot = selectedVehicle?.quote?.snapshot || null;

    if (!quoteSnapshot?.signature || isQuoteSnapshotExpired(quoteSnapshot)) {
      setPaymentSubmitting(true);
      setPaymentMessage("");
      try {
        await refreshExpiredQuote("La cotización del vehículo expiró.");
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
        body: JSON.stringify({ action: "EXIT", stayId: selectedVehicle.stay.id, paymentMethod: "CASH", quoteSnapshot }),
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
          await refreshExpiredQuote("La cotización venció.");
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
      setPaymentResult({
        plate: stay?.license_plate || selectedVehicle.stay.license_plate,
        total: amount,
        paymentMethod: payload?.data?.stay?.payment_method || "CASH",
      });
      const receiptPayload = buildPaymentReceiptPayload(stay, quote, parkingResponse);
      setReceiptPrintPayload(receiptPayload);
      setReceiptPrintStatus("");
      await loadTerminalState(true);

      const printResult = receiptPayload ? await printLastReceipt(receiptPayload) : null;
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
    if (cardPaymentLockRef.current || paymentSubmitting) return;
    if (!selectedVehicle?.stay?.id) return;

    cardPaymentLockRef.current = true;
    setPaymentSubmitting(true);
    setPaymentMessage("");

    try {
      const quoteSnapshot = selectedVehicle?.quote?.snapshot || null;

      // La cotización se valida ANTES de cobrar con TUU (nunca después): una
      // vez que TUU cobra la tarjeta, esa cobranza ya es real y no se puede
      // deshacer desde acá -- por eso este chequeo es más estricto que en
      // EFECTIVO (donde el backend recién cobra al confirmar).
      if (!quoteSnapshot?.signature || isQuoteSnapshotExpired(quoteSnapshot)) {
        await refreshExpiredQuote("La cotización del vehículo expiró.", { targetStep: "MENU" });
        return;
      }

      const amount = normalizeQuoteView(selectedVehicle.quote)?.total;
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        console.error("[pos:tuu:status]", { status: "ERROR", reason: "invalid_amount" });
        setPaymentStep("CARD_PAYMENT");
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("No hay un total válido para cobrar. Vuelve a abrir el detalle del vehículo.");
        return;
      }

      setPaymentStep("CARD_PAYMENT");
      setCardPaymentStatus("PROCESSING");
      setCardPaymentMessage("Procesando pago...");

      let tuuPayload;
      try {
        const netAmount = getTaxBreakdown(amount).netAmount;
        tuuPayload = buildTuuPaymentPayload({ amount, method: tuuMethod, netAmount });
      } catch (error) {
        console.error("[pos:tuu:payload]", { message: error instanceof Error ? error.message : String(error) });
        setCardPaymentStatus("ERROR");
        setCardPaymentMessage("Error de comunicación con TUU.");
        return;
      }

      console.info("[pos:tuu:start]", { package: TUU_PACKAGE_DEV, amount: tuuPayload.amount, method: tuuMethod });
      const outcome = await startTuuPayment(JSON.stringify(tuuPayload));
      console.info("[pos:tuu:outcome]", { delivered: Boolean(outcome?.delivered), code: outcome?.code || null });

      if (!outcome?.delivered) {
        if (outcome?.code === "TUU_NOT_INSTALLED" || outcome?.code === "TUU_BRIDGE_UNAVAILABLE") {
          console.info("[pos:tuu:status]", { status: "NOT_INSTALLED", code: outcome?.code || null });
          setCardPaymentStatus("NOT_INSTALLED");
          setCardPaymentMessage("TUU no está instalada en este dispositivo.");
        } else {
          console.error("[pos:tuu:status]", { status: "ERROR", code: outcome?.code || null });
          setCardPaymentStatus("ERROR");
          setCardPaymentMessage("Error de comunicación con TUU.");
        }
        return;
      }

      const tuuResult = outcome.result;
      if (!tuuResult?.success) {
        if (tuuResult?.cancelled) {
          console.info("[pos:tuu:status]", { status: "CANCELLED", responseCode: tuuResult?.responseCode || null });
          setCardPaymentStatus("CANCELLED");
          setCardPaymentMessage("Pago cancelado.");
        } else {
          console.info("[pos:tuu:status]", { status: "DECLINED", responseCode: tuuResult?.responseCode || null });
          setCardPaymentStatus("DECLINED");
          setCardPaymentMessage(tuuResult?.responseMessage || "Pago rechazado.");
        }
        return;
      }

      // A partir de aquí TUU YA cobró la tarjeta -- lo que sigue es registrar
      // la salida en ParkFacil. Cualquier falla desde este punto NUNCA vuelve
      // a MENU ni permite reintentar (evita un segundo cobro real): queda en
      // CHARGED_NOT_REGISTERED para que el operador contacte soporte.
      console.info("[pos:tuu:status]", { status: "APPROVED", transactionId: tuuResult?.transactionId || null });
      setCardPaymentStatus("APPROVED");
      setCardPaymentMessage("Pago aprobado. Registrando salida...");

      let response;
      try {
        response = await fetch("/api/data-entry", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-parkfacil-portal": "terminal",
          },
          cache: "no-store",
          body: JSON.stringify({ action: "EXIT", stayId: selectedVehicle.stay.id, paymentMethod: "CARD", quoteSnapshot }),
        });
      } catch {
        console.error("[pos:tuu:status]", { status: "CHARGED_NOT_REGISTERED", reason: "network_error" });
        setCardPaymentStatus("CHARGED_NOT_REGISTERED");
        setCardPaymentMessage("El pago fue aprobado por TUU pero hubo un error de red al registrar la salida. Contacta a soporte antes de reintentar.");
        return;
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("[pos:tuu:status]", { status: "CHARGED_NOT_REGISTERED", reason: payload?.error || "backend_error" });
        setCardPaymentStatus("CHARGED_NOT_REGISTERED");
        setCardPaymentMessage(
          `El pago fue aprobado por TUU pero no se pudo registrar la salida (${payload?.error || "error desconocido"}). Contacta a soporte antes de reintentar.`
        );
        return;
      }

      const stay = payload?.data?.stay || null;
      const quote = payload?.data?.quote || null;
      const parkingResponse = payload?.data?.parking || parking;
      const confirmedAmount = Number(quote?.total || 0);
      setPaymentResult({
        plate: stay?.license_plate || selectedVehicle.stay.license_plate,
        total: confirmedAmount,
        paymentMethod: payload?.data?.stay?.payment_method || "CARD",
      });
      const receiptPayload = buildPaymentReceiptPayload(stay, quote, parkingResponse, "CARD");
      setReceiptPrintPayload(receiptPayload);
      setReceiptPrintStatus("");
      await loadTerminalState(true);

      const printResult = receiptPayload ? await printLastReceipt(receiptPayload) : null;
      const printFailedOnDevice = Boolean(printResult?.attempted && !printResult.ok);

      if (printFailedOnDevice) {
        setPaymentStep("PRINT_PROMPT");
      } else {
        finishPaidFlow();
      }
    } finally {
      cardPaymentLockRef.current = false;
      setPaymentSubmitting(false);
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
      parking,
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

  async function submitEntry(event, confirmedPlateOverride = null) {
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
    if (platePhotoMode === "REQUIRED" && !entryPhoto) {
      setEntryErrorCode("PLATE_PHOTO_REQUIRED");
      setEntryError(entryPhotoRequirementMessage(platePhotoMode));
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
      setEntrySuccess(stay ? { stay, parking: parkingResponse } : null);
      const printPayload = buildEntryPrintPayload(stay, parkingResponse);
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

  const navItems = [
    { label: "INICIO", onSelect: () => goToSection(POS_VIEWS.HOME) },
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
        {shiftReadyForOperations ? (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Turno activo
          </div>
        ) : null}

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

        {entryStep === "PHOTO" && platePhotoMode !== "DISABLED" ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-700">
                Fotografía de patente {platePhotoMode === "REQUIRED" ? "(obligatoria)" : "(opcional)"}
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
                disabled={entrySubmitting || alreadyInside || (platePhotoMode === "REQUIRED" && !entryPhoto)}
                className="min-h-16 rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-black text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {entrySubmitting ? "Registrando..." : entryPhoto || platePhotoMode === "REQUIRED" ? "REGISTRAR INGRESO" : "REGISTRAR SIN FOTO"}
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
                    <td className="px-3 py-3 font-black text-rose-950">{stay?.license_plate || "-"}</td>
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

    if (shiftState === "PARKING_SELECTION_REQUIRED") {
      return renderShiftGate("Cierre de caja");
    }

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
            <p className="mt-1 text-sm font-bold text-slate-800">{parking?.name || "-"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Código</p>
            <p className="mt-1 text-sm font-bold text-slate-800">{parking?.code || "-"}</p>
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
            Volver
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
            <p className="text-sm font-semibold">Cotizando vehículo seleccionado...</p>
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
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">Tarifa aplicada</p>
            <p className="mt-1 font-bold text-rose-900">{tariffName}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-rose-700">TOTAL A PAGAR</p>
            {detailBreakdown ? (
              <div className="mt-1 space-y-1">
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
              <p className="mt-1 text-3xl font-black text-rose-950">{amount}</p>
            )}
          </div>
          {selectedVehicleError ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {selectedVehicleError}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={openPaymentModal}
            disabled={selectedVehicleLoading || !hasPayableQuote}
            className="rounded-xl bg-rose-900 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            PAGAR
          </button>
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            {hasPayableQuote ? "Preparado para seleccionar medio de pago." : "No existe una tarifa activa para esta estadía."}
          </div>
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

  function renderPaymentModal() {
    if (!paymentModalOpen || !selectedVehicle) return null;

    const stay = selectedVehicle.stay;
    const quote = selectedVehicle.quote;
    const quoteView = normalizeQuoteView(quote);
    // Desglose Neto/IVA a partir del TOTAL que ya cotizó el backend — ver
    // getTaxBreakdown. El pago confirmado más abajo (paymentBreakdown) usa
    // el total que confirmó el backend en la respuesta del EXIT, no este
    // valor pre-pago.
    const quoteBreakdown = quoteView?.payable && quoteView.total !== null ? getTaxBreakdown(quoteView.total) : null;
    const paymentBreakdown = paymentResult ? getTaxBreakdown(paymentResult.total) : null;

    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-rose-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closePaymentModal(); }}>
        <section className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
          <header className="flex items-center justify-between bg-rose-900 px-5 py-4 text-white">
            <div>
              <p className="text-xs font-semibold text-rose-200">Pago operacional</p>
              <h3 className="mt-1 text-xl font-black">Seleccione medio de pago</h3>
            </div>
            <button type="button" onClick={closePaymentModal} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar pago">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-500">Patente</p>
              <p className="mt-1 text-2xl font-black text-slate-900">{stay?.license_plate || "-"}</p>
              {quoteBreakdown ? (
                <div className="mt-3 space-y-1">
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

            {paymentStep === "MENU" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => handlePaymentSelection("CASH")} className="min-h-20 rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-black text-white transition hover:bg-emerald-500">
                  EFECTIVO
                </button>
                <button type="button" onClick={() => void handleCardPaymentSelection(TUU_METHOD.DEBIT)} className="min-h-20 rounded-2xl bg-sky-600 px-4 py-5 text-lg font-black text-white transition hover:bg-sky-500">
                  DÉBITO
                </button>
                <button type="button" onClick={() => void handleCardPaymentSelection(TUU_METHOD.CREDIT)} className="min-h-20 rounded-2xl bg-indigo-600 px-4 py-5 text-lg font-black text-white transition hover:bg-indigo-500">
                  CRÉDITO
                </button>
              </div>
            ) : null}

            {paymentStep === "CASH_CONFIRM" ? (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-lg font-black text-emerald-950">¿CONFIRMA PAGO EN EFECTIVO?</p>
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
                    {paymentSubmitting ? "Procesando..." : "CONFIRMAR PAGO"}
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
                  PAGO REGISTRADO ({formatPaymentMethodLabel(paymentResult?.paymentMethod)})<br />SALIDA COMPLETADA
                  <div className="mt-2 text-xs font-semibold text-emerald-800">Patente: {paymentResult?.plate || "-"}</div>
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
                cardPaymentStatus === "CHARGED_NOT_REGISTERED" || cardPaymentStatus === "ERROR"
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
                  <p className={`text-lg font-black ${cardPaymentStatus === "CHARGED_NOT_REGISTERED" || cardPaymentStatus === "ERROR" ? "text-red-950" : "text-sky-950"}`}>
                    {cardPaymentStatus === "DECLINED" && "PAGO RECHAZADO"}
                    {cardPaymentStatus === "CANCELLED" && "PAGO CANCELADO"}
                    {cardPaymentStatus === "NOT_INSTALLED" && "TUU NO ESTÁ INSTALADA"}
                    {cardPaymentStatus === "ERROR" && "ERROR DE COMUNICACIÓN CON TUU"}
                    {cardPaymentStatus === "CHARGED_NOT_REGISTERED" && "ATENCIÓN: PAGO COBRADO, SALIDA NO REGISTRADA"}
                    {cardPaymentMessage ? <span className="mt-2 block text-sm font-semibold">{cardPaymentMessage}</span> : null}
                  </p>
                )}

                {cardPaymentStatus && cardPaymentStatus !== "PROCESSING" && cardPaymentStatus !== "APPROVED" ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {cardPaymentStatus !== "CHARGED_NOT_REGISTERED" ? (
                      <button
                        type="button"
                        onClick={() => { setPaymentStep("MENU"); setCardPaymentStatus(""); setCardPaymentMessage(""); }}
                        className="rounded-xl bg-sky-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white transition hover:bg-sky-600"
                      >
                        REINTENTAR
                      </button>
                    ) : null}
                    <button type="button" onClick={closePaymentModal} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100">
                      CERRAR
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {paymentStep === "MENU" ? (
              <button type="button" onClick={closePaymentModal} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-800 transition hover:bg-slate-100">
                VOLVER
              </button>
            ) : null}
          </div>
        </section>
      </div>
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
      {paymentModalOpen ? renderPaymentModal() : null}

      {photoCaptureOpen ? (
        <PlatePhotoCapture
          plate={formatTicketPlate(entryPlate)}
          required={platePhotoMode === "REQUIRED"}
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
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.onSelect()}
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
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
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => item.onSelect()}
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Versión {POS_FRONTEND_VERSION}</p>
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
              ParkFacil POS · Versión {POS_FRONTEND_VERSION}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
