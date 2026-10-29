import { canCaptureCardType, validatePaymentCardType } from "@/lib/paymentCardType.mjs";
import { posCardPaymentsEnabled } from "@/lib/pos/cardPaymentsAvailability.mjs";
import { sanitizeTuuCardDetails } from "@/lib/pos/tuuCardDetails.mjs";
import { issueCashPaymentBoleta } from "@/lib/boletaElectronica/cashBoletaService";
import { COUPONS_DISABLED_ERROR, couponsEnabled } from "@/lib/cupones/couponsAvailability.mjs";
import { couponsActiveForParking } from "@/lib/cupones/couponModuleServer";
import { COUPON_MODULE_INACTIVE_ERROR } from "@/lib/cupones/couponModuleCore.mjs";
import { couponAvailableForCharge } from "@/lib/cupones/couponInput.mjs";
import { canStoreCardPaymentReference, validateCardPaymentReference } from "@/lib/pos/cardPaymentReference.mjs";
import { CARD_ATTEMPT_OUTCOMES, CARD_ATTEMPT_STATUS, reservedPaymentCodeFrom, storedChargeSnapshotProblem, cardAttemptErrorResponse, cardRegistrationStayIdProblem, cardRegistrationStayMismatch, findActiveCardPaymentAttemptRow, getCardPaymentAttemptRow, isCardAttemptsStorageMissing, isUuid, mapCardPaymentAttemptForPos, markCardPaymentAttemptSent, normalizeDeclaredTuuEnvironment, paymentFromChargeSnapshot, registerCardPaymentAttempt, reportCardPaymentAttemptResult, reserveCardPaymentAttempt, sanitizeDeviceId, sanitizeIdempotencyKey, tuuEnvironmentCompatibilityProblem, tuuEnvironmentFromEnv } from "@/lib/pos/cardPaymentAttempts.mjs";
import { canRevertUnpaidMark, sanitizeUnpaidNotes } from "@/lib/parkingDebtsCore.mjs";
import { buildDebtNoticeForPlate, getPendingUnpaidStay, listPendingUnpaidStaysForShift, markStayUnpaid, revertStayUnpaid } from "@/lib/parkingDebtsRepository";
import { getDebtNoticeEnabled } from "@/lib/offStreet/debtNoticeSettingsRepository";
import { NextResponse } from "next/server";
import { formatChileanPlate, joinChileanPlate } from "@/lib/dataEntry.mjs";
import { buildPosQuoteSnapshot, loadReleasedStaySnapshot, quoteParkingStay, quoteReleasedParkingStay, snapshotHasChargeBreakdown, verifyPosQuoteSnapshot } from "@/lib/parkingStayQuoteService";
import { describeAuthorization } from "@/lib/releasedPayment/authorizationCore.mjs";
import { ENTRY_DECISION, evaluateReleasedEntry, releasedStayCoverage } from "@/lib/releasedPayment/releasedStayCore.mjs";
import { activeOperatorAssignments, operationalClock, resolveEntryStreetLocation, STREET_LOCATION_ERRORS, streetLocationErrorCode } from "@/lib/offStreet/streetLocationCore.mjs";
import { loadStreetLocationData } from "@/lib/offStreet/streetLocationServer";
import { loadModuleStates, loadPlateAuthorizations, rpcErrorCode, storageMissing } from "@/lib/releasedPayment/releasedPaymentServer";
import { evaluateReleasedPlateEntry, PLATE_ENTRY_DECISION, releasedTicketDetail, releasedTicketLabel } from "@/lib/releasedPlates/releasedPlateCore.mjs";
import { loadPlateEntryContext, storageMissing as releasedPlateStorageMissing } from "@/lib/releasedPlates/releasedPlateServer";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, posParkingSelectionRequiredResponse, requireOperationalParking, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { isRequestedParkingConsistent, POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { getPlatePhotoSettings } from "@/lib/offStreet/offStreetPlatePhotoSettingsRepository";
import { linkPlateEntryPhoto, removeOrphanedPlatePhoto, uploadPlateEntryPhoto } from "@/lib/offStreet/platePhotoEvidenceRepository";
import { canCompleteEntry, canCompleteEvidenceGps, entryPhotoRequirementMessage, gpsRequirementMessage, validatePlatePhotoFile } from "@/lib/offStreet/offStreetPlatePhoto.mjs";

const publicStayFields = "id,code,parking_id,license_plate,qr_token,status,entry_at,entry_operator_name,entry_source,entry_shift_id,exit_at,exit_operator_name,payment_shift_id,elapsed_minutes,rate_id,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,coupon_id,coupon_code,discount_amount,subtotal_amount,updated_at";
const ticketParkingFields = "id,code,name,company_name,address,city,status,company:companies(business_name,address,district,city,rut_number,rut_dv,phone)";

function fail(message, status = 400, details) { return NextResponse.json({ error: message, details }, { status }); }
function code(prefix) { return `${prefix}-${new Date().toISOString().replace(/\D/g, "").slice(2, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`; }

// Ajuste final (GPS/metadatos de evidencia, §16/§18): null/undefined/""
// tratados como AUSENTES, nunca como 0 -- mismo tipo de bug ya corregido en
// este proyecto para numeroSeguro/toFiniteNumberOrNull (Number(null) es 0 y
// pasaría Number.isFinite). GPS ausente queda null, nunca (0, 0).
function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// El cliente envía latitude/longitude solo si obtuvo una posición real
// (nunca se inventa una cuando GPS está DISABLED o no disponible, §18).
function decodePlateGpsInput(input) {
  const latitude = toFiniteOrNull(input?.platePhotoLatitude);
  const longitude = toFiniteOrNull(input?.platePhotoLongitude);
  if (latitude === null || longitude === null) return { latitude: null, longitude: null, accuracy: null };
  return { latitude, longitude, accuracy: toFiniteOrNull(input?.platePhotoGpsAccuracyM) };
}

// §20: solo datos razonables del dispositivo, nunca identificadores
// innecesarios -- se acepta lo que ya expone window.ParkFacilDevice.getDeviceInfo()
// (bridge existente, ver ParkFacilDeviceBridge.kt) o el descriptor mínimo
// del navegador cuando no hay bridge nativo; cualquier otro campo enviado se
// descarta.
function sanitizeDeviceInfo(value) {
  if (!value || typeof value !== "object") return null;
  const pick = (field, max) => String(value[field] || "").trim().slice(0, max) || null;
  const info = {
    platform: pick("platform", 20),
    manufacturer: pick("manufacturer", 60),
    model: pick("model", 60),
    appVersion: pick("appVersion", 30) || pick("runtimeVersion", 30),
  };
  return Object.values(info).some(Boolean) ? info : null;
}

function sanitizeCapturedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Fase 6 (fotografía de patente): el cliente ya comprime la imagen y la
// envía como data URL ("data:image/jpeg;base64,...") o como base64 puro +
// mimeType aparte. Se acepta cualquiera de las dos formas sin normalizar el
// payload de ENTRY en sí (compatibilidad con clientes existentes que nunca
// envían esto).
function decodePlatePhotoInput(input) {
  const raw = String(input?.platePhotoBase64 || "").trim();
  if (!raw) return null;
  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/s);
  const mimeType = dataUrlMatch ? dataUrlMatch[1] : String(input?.platePhotoMimeType || "image/jpeg");
  const base64 = dataUrlMatch ? dataUrlMatch[2] : raw;
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return { error: "PLATE_PHOTO_DECODE_FAILED" };
  }
  if (!buffer.length) return { error: "PLATE_PHOTO_DECODE_FAILED" };
  return { buffer, mimeType, sizeBytes: buffer.length };
}

async function context(request, requestedParkingId = null) {
  let authorization;
  try {
  authorization = await authorizeOperationRequest(request, PERMISSIONS.OPERATIONS_USE);
  if (authorization.response) return { response: authorization.response };
  let parkingId = requestedParkingId;
  // Scope con el que se revalida el estacionamiento; solo el POS lo acota al
  // Off Street resuelto para su turno (ver resolvePosOperationalParking).
  let parkingScope = authorization.scope;
  const isTerminalRequest = String(request.headers.get("x-parkfacil-portal") || "").toLowerCase() === "terminal";
  // POS Entry/Exit — Fase 1: operadores y cualquier solicitud del terminal
  // resuelven el estacionamiento con la MISMA regla que /api/pos/* (turno
  // abierto como fuente de verdad, ver resolvePosOperationalParking), nunca
  // con la primera asignación sin orden. Un parkingId enviado por el cliente solo se
  // acepta si coincide con el resuelto server-side.
  if (isTerminalRequest || authorization.context.role === ROLES.OPERATOR) {
    const resolved = await resolvePosOperationalParking(authorization);
    if (resolved.status === POS_PARKING_RESOLUTION.SELECTION_REQUIRED) {
      return { response: NextResponse.json(posParkingSelectionRequiredResponse(), { status: 409 }) };
    }
    if (!isRequestedParkingConsistent(resolved.parkingId, requestedParkingId)) {
      return { response: fail("El estacionamiento solicitado no corresponde a tu sesión POS.", 403, { code: "POS_PARKING_MISMATCH" }) };
    }
    parkingId = resolved.parkingId;
    parkingScope = resolved.parkingScope || authorization.scope;
  }
  if (!parkingId && !isTerminalRequest && authorization.context.role !== ROLES.OPERATOR) {
    let query = authorization.db.from("parkings").select("id").eq("status", "ACTIVE").order("code").limit(1);
    if (authorization.scope.companyId) query = query.eq("company_id", authorization.scope.companyId);
    const result = await query;
    if (result.error) throw result.error;
    parkingId = result.data?.[0]?.id || null;
  }
  if (!parkingId) return { response: fail("El usuario no tiene un estacionamiento autorizado.", 404) };
  const parking = await requireOperationalParking(authorization.db, authorization.context, parkingScope, parkingId);
  return { ...authorization, actor: { ...posOperationActor(authorization.context), parkingId: parking.id }, parking };
  } catch (error) {
    const denied = operationAuthorizationError(request, authorization?.context, error);
    if (denied) return { response: denied };
    throw error;
  }
}

async function findOpenStay(db, input, assignedParkingId) {
  let query = db.from("parking_stays").select(publicStayFields).eq("status", "OPEN");
  if (assignedParkingId) query = query.eq("parking_id", assignedParkingId);
  if (input.stayId) query = query.eq("id", input.stayId);
  else if (input.qrToken) query = query.eq("qr_token", input.qrToken);
  else if (input.plate) query = query.eq("license_plate", input.plate.toUpperCase());
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// Off Street — Pago liberado (Etapa 2): decisión de ingreso con beneficio
// para una patente en el estacionamiento del operador. El operador solo
// aplica la regla: no edita autorizaciones ni precios. Sin la migración del
// módulo, ninguna patente es liberada (el flujo normal no cambia).
async function releasedEntryDecision(db, parkingId, plate, now = new Date()) {
  // Modelo gestionado por el cliente (SOL-2026-10-28-003): si la empresa tiene
  // una autorización activa para la patente, decide este modelo.
  try {
    const context = await loadPlateEntryContext(db, parkingId, plate);
    const result = evaluateReleasedPlateEntry({ enabled: context.enabled, authorizations: context.authorizations, now });
    if (result.decision !== PLATE_ENTRY_DECISION.NOT_AUTHORIZED) return { ...result, model: "CLIENT" };
  } catch (error) {
    if (!releasedPlateStorageMissing(error)) throw error;
  }
  try {
    const authorizations = await loadPlateAuthorizations(db, parkingId, plate);
    if (!authorizations.length) return { decision: ENTRY_DECISION.NOT_AUTHORIZED };
    const state = (await loadModuleStates(db, [parkingId], now)).get(parkingId);
    return { ...evaluateReleasedEntry({ module: state?.module, contract: state?.contract, authorizations, openReleasedStays: state?.openReleasedStays || 0, now }), contract: state?.contract || null };
  } catch (error) {
    if (storageMissing(error) || ["42703", "PGRST204"].includes(error?.code)) return { decision: ENTRY_DECISION.NOT_AUTHORIZED };
    throw error;
  }
}

function releasedCheckPayload(plate, result) {
  const eligible = result.decision === ENTRY_DECISION.ELIGIBLE;
  if (result.model === "CLIENT") {
    const ticket = eligible ? { label: releasedTicketLabel(result.authorization), detail: releasedTicketDetail(result.authorization) } : null;
    return {
      plate,
      decision: result.decision,
      released: eligible,
      photoRequired: eligible,
      message: eligible ? `PATENTE LIBERADA: ${ticket.label}. Foto obligatoria.` : result.message || null,
      spots: null,
      ticket,
      authorization: eligible ? {
        description: ticket.detail,
        beneficiaryName: result.authorization.beneficiaryName || "",
        thirdPartyName: result.authorization.thirdParty?.name || null,
        uses: result.authorization.maxUses ? `Uso ${result.authorization.usesCount + 1} de ${result.authorization.maxUses}` : null,
      } : null,
    };
  }
  return {
    plate,
    decision: result.decision,
    released: eligible,
    photoRequired: eligible,
    message: eligible ? "PATENTE LIBERADA: foto obligatoria; ocupa un cupo liberado." : result.message || null,
    spots: result.spots || null,
    authorization: eligible ? { description: describeAuthorization(result.authorization), beneficiaryName: result.authorization.beneficiaryName || "" } : null,
  };
}

const RELEASED_ENTRY_ERRORS = {
  RELEASED_PAYMENT_NO_SPOTS: "Sin cupos liberados disponibles. Vuelve a validar la patente.",
  RELEASED_PAYMENT_STAY_DUPLICATE: "Este vehículo ya tiene una estadía abierta.",
  RELEASED_PAYMENT_MODULE_DISABLED: "Módulo desactivado: vuelve a validar la patente.",
  RELEASED_PAYMENT_CONTRACT_CHANGED: "La contratación cambió: vuelve a validar la patente.",
  RELEASED_PAYMENT_CONTRACT_NOT_CURRENT: "La contratación no está vigente: vuelve a validar la patente.",
  RELEASED_PAYMENT_AUTHORIZATION_INVALID: "La autorización cambió: vuelve a validar la patente.",
  RELEASED_PAYMENT_AUTHORIZATION_NOT_CURRENT: "La autorización no aplica hoy: vuelve a validar la patente.",
  RELEASED_PAYMENT_AUTHORIZATION_UNPAID: "La autorización tiene el pago pendiente: vuelve a validar la patente.",
  RELEASED_PLATE_STAY_DUPLICATE: "Este vehículo ya se encuentra dentro del estacionamiento.",
  RELEASED_PLATE_MODULE_DISABLED: "Pago liberado se desactivó en este estacionamiento: vuelve a validar la patente.",
  RELEASED_PLATE_AUTHORIZATION_INVALID: "La autorización cambió: vuelve a validar la patente.",
  RELEASED_PLATE_NOT_CURRENT: "La autorización ya no está vigente: vuelve a validar la patente.",
  RELEASED_PLATE_WEEKEND: "La autorización es solo de lunes a viernes: vuelve a validar la patente.",
  RELEASED_PLATE_NO_USES: "La autorización agotó sus usos: vuelve a validar la patente.",
};

const RELEASED_DUPLICATE_CODES = new Set(["RELEASED_PAYMENT_STAY_DUPLICATE", "RELEASED_PLATE_STAY_DUPLICATE"]);
const releasedEntryErrorCode = (error) => {
  const message = String(error?.message || "");
  return Object.keys(RELEASED_ENTRY_ERRORS).find((key) => message.includes(key)) || rpcErrorCode(error);
};

async function requireOpenPosShift(db, actor) {
  const { data, error } = await db.from("operator_shifts").select("id,operator_id,parking_id,status")
    .eq("operator_id", actor.id).eq("parking_id", actor.parkingId).eq("status", "OPEN").limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function GET(request) {
  const requestedParkingId = new URL(request.url).searchParams.get("parkingId");
  const current = await context(request, requestedParkingId); if (current.response) return current.response;
  const [parkingResult, stayResult, platePhotoSettings] = await Promise.all([
    current.db.from("parkings").select(ticketParkingFields).eq("id", current.actor.parkingId).eq("status", "ACTIVE").maybeSingle(),
    current.db.from("parking_stays").select(publicStayFields).eq("parking_id", current.actor.parkingId).eq("status", "OPEN").order("entry_at", { ascending: false }),
    // Fase 6: el POS necesita conocer el modo configurado (DISABLED por
    // defecto, ver offStreetPlatePhotoSettingsRepository.js) para decidir si
    // muestra el control de cámara en el formulario de ingreso. Sin fila de
    // configuración, el resultado es DISABLED — el flujo actual queda 100%
    // intacto (§12 del encargo).
    getPlatePhotoSettings(current.db, current.actor.parkingId).catch(() => ({ plateMode: "DISABLED", printOnTicket: false, gpsMode: "DISABLED" })),
  ]);
  const { data: parking, error: parkingError } = parkingResult;
  const { data: stays, error: stayError } = stayResult;
  if (parkingError) return fail("No fue posible cargar el estacionamiento asignado.", 503);
  if (!parking) return fail("El estacionamiento asignado no está activo o no existe.", 409);
  const operationalStorageMissing = ["42P01", "PGRST204", "PGRST205"].includes(stayError?.code);
  if (stayError && !operationalStorageMissing) return fail("No fue posible cargar los vehículos estacionados.", 503);
  // Salidas sin pago marcadas en el turno abierto del operador (SOL-2026-10-08-003):
  // el POS las lista con su monto en curso y permite revertir una marca errónea.
  let unpaidPending = [];
  if (String(request.headers.get("x-parkfacil-portal") || "").toLowerCase() === "terminal" && !operationalStorageMissing) {
    try {
      const shift = await requireOpenPosShift(current.db, current.actor);
      if (shift) unpaidPending = await listPendingUnpaidStaysForShift(current.db, shift.id);
    } catch (unpaidError) {
      console.error("[data-entry:GET:unpaid-pending]", { code: unpaidError?.code, message: unpaidError?.message });
    }
  }
  return NextResponse.json({
    data: {
      parking,
      stays: operationalStorageMissing ? [] : (stays || []),
      storageReady: !operationalStorageMissing,
      warning: operationalStorageMissing ? "El almacenamiento operacional todavía no está activado; la asignación sí fue cargada." : null,
      actor: { name: current.actor.name, role: current.actor.role, parkingId: current.actor.parkingId },
      platePhotoSettings: { mode: platePhotoSettings.plateMode, printOnTicket: platePhotoSettings.printOnTicket, gpsMode: platePhotoSettings.gpsMode },
      unpaidPending,
    },
  });
}

// Aviso de deuda pendiente al ingresar una patente (D6, D7): deudas de la
// patente en cualquier estacionamiento de la empresa, solo si el
// estacionamiento de ingreso tiene el aviso activo. Nunca hace fallar el ingreso.
async function entryDebtNotice(db, parking, plate) {
  try {
    if (!(await getDebtNoticeEnabled(db, parking.id))) return null;
    const { data: companyParkings, error } = await db.from("parkings").select("id").eq("company_id", parking.companyId);
    if (error) throw error;
    return await buildDebtNoticeForPlate(db, { companyId: parking.companyId, plate, parkingIds: (companyParkings || []).map((row) => row.id) });
  } catch (noticeError) {
    console.error("[data-entry:ENTRY:debt-notice]", { code: noticeError?.code, message: noticeError?.message });
    return null;
  }
}

const CARD_ATTEMPT_ACTIVE_MESSAGE = "Este ticket tiene un pago con tarjeta en curso o por resolver. No se puede pagar ni cerrar por otra vía hasta resolverlo.";

// Reserva central (SOL-2026-10-11-001): ¿el ticket tiene un intento de pago
// con tarjeta activo? Sin la migración aplicada no hay intentos: devuelve
// null y los demás medios de pago siguen funcionando como siempre. La guarda
// definitiva es el trigger de la base (parking_stays_guard_card_attempt).
async function activeCardAttemptOrNull(db, stayId) {
  try {
    return await findActiveCardPaymentAttemptRow(db, { stayId });
  } catch (error) {
    if (isCardAttemptsStorageMissing(error)) return null;
    throw error;
  }
}

// Cálculo de cobro firmado por el servidor: mismas validaciones que el pago
// en efectivo. Devuelve null si es válido.
function chargeSnapshotProblem(snapshot, stay, { now = new Date() } = {}) {
  const expiresAt = snapshot?.expiresAt ? new Date(snapshot.expiresAt) : null;
  if (!snapshot?.signature) return { status: 409, code: "QUOTE_SNAPSHOT_REQUIRED", error: "El cálculo de cobro expiró o no es válido. Actualiza el vehículo para obtener el monto a pagar." };
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= now) return { status: 409, code: "QUOTE_SNAPSHOT_EXPIRED", error: "El cálculo de cobro expiró. Actualiza el vehículo para obtener el monto a pagar." };
  if (snapshot.stayId !== stay.id || snapshot.parkingId !== stay.parking_id || snapshot.stayUpdatedAt !== stay.updated_at) return { status: 409, code: "QUOTE_SNAPSHOT_STALE", error: "El cálculo de cobro ya no corresponde a este ticket. Actualiza el vehículo para obtener el monto a pagar." };
  return chargeSnapshotSignatureProblem(snapshot);
}

function chargeSnapshotSignatureProblem(snapshot) {
  const secret = process.env.POS_QUOTE_HMAC_SECRET;
  if (!secret) return { status: 503, code: "QUOTE_SIGNATURE_UNAVAILABLE", error: "La validación del cálculo de cobro no está configurada." };
  let valid = false;
  try { valid = verifyPosQuoteSnapshot(snapshot, snapshot?.signature, secret); } catch { valid = false; }
  return valid ? null : { status: 409, code: "QUOTE_SNAPSHOT_INVALID", error: "El cálculo de cobro no pudo validarse. Actualiza el vehículo para obtener el monto a pagar." };
}

function quoteFromChargeSnapshot(snapshot) {
  return {
    blocked: false,
    elapsedMinutes: Number.isFinite(Number(snapshot.elapsedMinutes)) ? Number(snapshot.elapsedMinutes) : null,
    subtotal: Number(snapshot.subtotalAmount || 0),
    discount: Number(snapshot.discountAmount || 0),
    net: Number(snapshot.netAmount || 0),
    tax: Number(snapshot.taxAmount || 0),
    total: Number(snapshot.totalAmount || 0),
    rate: { id: snapshot.rateId || null, name: snapshot.rateName || null, billingMode: snapshot.billingMode || null, currency: snapshot.currency || "CLP" },
    coupon: snapshot.couponId ? { id: snapshot.couponId, code: snapshot.couponCode || null, benefitType: snapshot.couponBenefitType || null, value: Number.isFinite(Number(snapshot.couponBenefitValue)) ? Number(snapshot.couponBenefitValue) : null } : null,
    snapshot,
  };
}

// Reserva central de intentos de pago con tarjeta (POS):
//   CARD_PAYMENT_RESERVE  reserva el intento ANTES de abrir TUU (atómico en la base).
//   CARD_PAYMENT_SENT     el POS confirma que va a abrir TUU.
//   CARD_PAYMENT_RESULT   resultado entregado por TUU (también tardío).
// Sin reserva confirmada el POS no abre TUU. Si la migración no está aplicada
// se responde 503: no existe un modo alternativo solo local.
async function handleCardPaymentAttemptAction({ input, current, isPosRequest, posShift }) {
  if (!isPosRequest || !posShift) return fail("Debes iniciar un turno en el POS para cobrar con tarjeta.", 409, { code: "OPEN_SHIFT_REQUIRED" });
  const companyId = current.parking?.companyId || null;
  const deviceId = sanitizeDeviceId(input.deviceId);
  if (!companyId || !deviceId) return fail("No fue posible identificar este equipo. No se inició ningún cobro.", 400, { code: "CARD_ATTEMPT_DEVICE_REQUIRED" });
  const log = (event, extra = {}) => console.info("[data-entry:card-attempt]", { event, action: input.action, parkingId: current.actor.parkingId, operatorId: current.actor.id, shiftId: posShift.id, deviceId, ...extra });
  try {
    if (input.action === "CARD_PAYMENT_RESERVE") {
      const idempotencyKey = sanitizeIdempotencyKey(input.idempotencyKey);
      if (!idempotencyKey) return fail("La solicitud de pago no es válida. No se inició ningún cobro.", 400, { code: "CARD_ATTEMPT_IDEMPOTENCY_KEY_REQUIRED" });
      // Ambiente TUU: el del servidor manda. Lo que declara el equipo solo
      // sirve para rechazar una mezcla DEV/PROD; no es una prueba de autenticidad.
      const serverEnvironment = tuuEnvironmentFromEnv(process.env);
      const environmentProblem = tuuEnvironmentCompatibilityProblem({ serverEnvironment, declaredEnvironment: normalizeDeclaredTuuEnvironment(input.tuuEnvironment) });
      if (environmentProblem) {
        log("ENVIRONMENT_REJECTED", { code: environmentProblem.code, serverEnvironment });
        return fail(environmentProblem.error, environmentProblem.status, { code: environmentProblem.code });
      }
      let cardType = null;
      try { cardType = validatePaymentCardType("CARD", input.paymentCardType); } catch { cardType = null; }
      if (!cardType) return fail("Selecciona Débito o Crédito.", 400, { code: "INVALID_PAYMENT_CARD_TYPE" });
      if (!(await canCaptureCardType(current.db, current.actor.parkingId))) return fail("Falta habilitar el registro de Crédito y Débito.", 503, { code: "CARD_TYPE_SCHEMA_UNAVAILABLE" });
      const stay = await findOpenStay(current.db, { stayId: input.stayId }, current.actor.parkingId);
      if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
      // El monto lo fija el servidor: es el del cálculo de cobro firmado y vigente.
      const problem = chargeSnapshotProblem(input.quoteSnapshot || null, stay);
      if (problem) return fail(problem.error, problem.status, { code: problem.code });
      const amount = Math.round(Number(input.quoteSnapshot.totalAmount || 0));
      if (!(amount > 0)) return fail("El monto a pagar no es válido.", 409, { code: "CARD_ATTEMPT_AMOUNT_INVALID" });
      // Cupón (SOL-2026-10-19-002): se canjea al registrar el pago, después del
      // cobro en TUU. Antes de cobrar se confirma que siga disponible para no
      // cobrar con un descuento que luego no se puede canjear.
      if (input.quoteSnapshot.couponId) {
        if (!couponsEnabled()) return fail(COUPONS_DISABLED_ERROR.error, 403, { code: COUPONS_DISABLED_ERROR.code });
        if (!(await couponsActiveForParking(current.db, stay.parking_id))) return fail(COUPON_MODULE_INACTIVE_ERROR.error, 403, { code: COUPON_MODULE_INACTIVE_ERROR.code });
        const { data: couponRow, error: couponError } = await current.db.from("coupons").select("id,status,redeemed_at,expires_at").eq("id", input.quoteSnapshot.couponId).maybeSingle();
        if (couponError) return fail("No fue posible validar el cupón. No se inició ningún cobro.", 503, { code: "COUPON_CHECK_FAILED" });
        if (!couponAvailableForCharge(couponRow)) return fail("El cupón ya fue utilizado o venció. Quita el cupón y vuelve a calcular. No se inició ningún cobro.", 409, { code: "COUPON_UNAVAILABLE" });
      }
      const row = await reserveCardPaymentAttempt(current.db, {
        idempotencyKey, companyId, parkingId: stay.parking_id, stayId: stay.id,
        operatorId: current.actor.id, operatorName: current.actor.name, shiftId: posShift.id, deviceId,
        // Código PAG reservado (SOL-2026-10-11-001): el POS lo imprime al aprobar TUU.
        environment: serverEnvironment, cardType, amount, chargeSnapshot: { ...input.quoteSnapshot, reservedPaymentCode: code("PAG") },
      });
      log("RESERVED", { attemptId: row?.id || null, stayId: stay.id, ticket: stay.code, plate: stay.license_plate, amount, cardType, status: row?.status || null });
      return NextResponse.json({ data: { attempt: mapCardPaymentAttemptForPos(row) } });
    }

    const attemptId = isUuid(input.attemptId) ? input.attemptId : null;
    if (!attemptId) return fail("El intento de pago no es válido.", 400, { code: "CARD_ATTEMPT_ID_REQUIRED" });

    if (input.action === "CARD_PAYMENT_SENT") {
      const row = await markCardPaymentAttemptSent(current.db, { attemptId, companyId, operatorId: current.actor.id, deviceId });
      log("SENT", { attemptId, status: row?.status || null });
      return NextResponse.json({ data: { attempt: mapCardPaymentAttemptForPos(row) } });
    }

    if (!CARD_ATTEMPT_OUTCOMES.includes(input.outcome)) return fail("El resultado informado no es válido.", 400, { code: "CARD_ATTEMPT_OUTCOME_INVALID" });
    const row = await reportCardPaymentAttemptResult(current.db, {
      attemptId, companyId, deviceId, outcome: input.outcome,
      reference: input.reference || null,
      errorCode: input.errorCode ? String(input.errorCode).slice(0, 40) : null,
      errorMessage: input.errorMessage ? String(input.errorMessage).slice(0, 200) : null,
    });
    log("RESULT", { attemptId, outcome: input.outcome, status: row?.status || null, reference: row?.provider_reference || null, errorCode: row?.provider_error_code || null });
    return NextResponse.json({ data: { attempt: mapCardPaymentAttemptForPos(row) } });
  } catch (error) {
    const mapped = cardAttemptErrorResponse(error);
    if (mapped) {
      log("REJECTED", { code: mapped.code });
      return fail(mapped.error, mapped.status, { code: mapped.code });
    }
    console.error("[data-entry:card-attempt]", { action: input.action, code: error?.code, message: error?.message });
    return fail("No fue posible confirmar la operación del pago con tarjeta.", 503, { code: "CARD_ATTEMPT_FAILED" });
  }
}

// Registro del pago con tarjeta desde el POS: SIEMPRE por intento reservado y
// aprobado. El registro del pago y el cierre del intento ocurren en una sola
// transacción (register_pos_card_payment); repetirlo devuelve el pago
// existente. Monto y datos salen del cálculo de cobro guardado en el intento.
// Pago liberado (SOL-2026-10-16-003): una estadía liberada cuyo excedente se paga con
// tarjeta guarda el tiempo cubierto y cobrado, igual que en efectivo. Se calcula hasta la
// hora del cálculo de cobro firmado (el monto cobrado). El pago ya quedó registrado: un
// fallo aquí solo se registra en el log, nunca revierte el cobro.
async function recordReleasedSecondsForCard(db, stayId, calculatedAt) {
  try {
    const { data: stay, error } = await db.from("parking_stays").select("id,entry_at,exit_at,released_payment_snapshot,released_payment_authorization_id").eq("id", stayId).maybeSingle();
    if (error) throw error;
    if (!stay?.released_payment_authorization_id) return;
    const until = calculatedAt || stay.exit_at;
    if (!until) return;
    const coverage = releasedStayCoverage(stay.released_payment_snapshot, stay.entry_at, until);
    const update = await db.from("parking_stays").update({ released_covered_seconds: coverage.coveredSeconds, released_chargeable_seconds: coverage.chargeableSeconds }).eq("id", stay.id);
    if (update.error) throw update.error;
  } catch (error) {
    console.error("[data-entry:card-released-seconds]", { stayId, code: error?.code, message: error?.message });
  }
}

async function registerCardPaymentFromAttempt({ input, current, posShift }) {
  const attemptId = isUuid(input?.cardPayment?.attemptId) ? input.cardPayment.attemptId : null;
  if (!attemptId) return fail("El pago con tarjeta requiere un intento reservado. Vuelve a abrir el vehículo.", 409, { code: "CARD_PAYMENT_ATTEMPT_REQUIRED" });
  // El ticket solicitado es obligatorio y debe ser el del intento (D1).
  const stayIdProblem = cardRegistrationStayIdProblem(input?.stayId);
  if (stayIdProblem) return fail(stayIdProblem.error, stayIdProblem.status, { code: stayIdProblem.code });
  const companyId = current.parking?.companyId || null;
  const log = (event, extra = {}) => console.info("[data-entry:card-attempt]", { event, action: "EXIT", attemptId, parkingId: current.actor.parkingId, operatorId: current.actor.id, shiftId: posShift.id, ...extra });
  let attempt;
  try {
    attempt = await getCardPaymentAttemptRow(current.db, { attemptId, companyId });
  } catch (error) {
    const mapped = cardAttemptErrorResponse(error);
    if (mapped) return fail(mapped.error, mapped.status, { code: mapped.code });
    console.error("[data-entry:card-attempt]", { action: "EXIT", code: error?.code, message: error?.message });
    return fail("No fue posible registrar el pago.", 503, { code: "CARD_ATTEMPT_FAILED" });
  }
  if (!attempt) return fail("No existe el intento de pago solicitado.", 404, { code: "CARD_ATTEMPT_NOT_FOUND" });
  // Antes de cualquier modificación y también si el intento ya está PAID: un
  // intento nunca responde éxito para un ticket que no es el suyo.
  const stayMismatch = cardRegistrationStayMismatch(input.stayId, attempt);
  if (stayMismatch) {
    log("REGISTRATION_REJECTED", { code: stayMismatch.code });
    return fail(stayMismatch.error, stayMismatch.status, { code: stayMismatch.code });
  }
  if (attempt.parking_id !== current.actor.parkingId) {
    return fail("Este pago corresponde a otro estacionamiento. Inicia turno allí para registrarlo.", 409, { code: "CARD_ATTEMPT_OTHER_PARKING" });
  }
  // Una sola llamada (QA PRO2 2026-10-19, SOL-2026-10-11-001): el POS puede enviar
  // junto al registro el resultado APROBADO de TUU. Se guarda con la misma RPC que
  // CARD_PAYMENT_RESULT y se registra a continuación; ahorra una ida y vuelta (~1,2 s).
  const approvedResult = input?.cardPayment?.result;
  if (approvedResult?.outcome === "APPROVED" && ![CARD_ATTEMPT_STATUS.APPROVED_PENDING_REGISTRATION, CARD_ATTEMPT_STATUS.PAID].includes(attempt.status)) {
    try {
      attempt = await reportCardPaymentAttemptResult(current.db, {
        attemptId, companyId, deviceId: sanitizeDeviceId(approvedResult.deviceId), outcome: "APPROVED",
        reference: approvedResult.reference || null, errorCode: null, errorMessage: null,
      });
      log("RESULT", { outcome: "APPROVED", combined: true, status: attempt?.status || null, reference: attempt?.provider_reference || null });
    } catch (error) {
      const mapped = cardAttemptErrorResponse(error);
      if (mapped) return fail(mapped.error, mapped.status, { code: mapped.code });
      console.error("[data-entry:card-attempt]", { action: "EXIT", code: error?.code, message: error?.message });
      return fail("No fue posible registrar el pago.", 503, { code: "CARD_ATTEMPT_FAILED" });
    }
    if (!attempt) return fail("No existe el intento de pago solicitado.", 404, { code: "CARD_ATTEMPT_NOT_FOUND" });
  }
  if (![CARD_ATTEMPT_STATUS.APPROVED_PENDING_REGISTRATION, CARD_ATTEMPT_STATUS.PAID].includes(attempt.status)) {
    return fail("El pago todavía no está aprobado. No se registró.", 409, { code: "CARD_ATTEMPT_NOT_APPROVED" });
  }
  // El cálculo lo guardó el servidor al reservar, DESPUÉS de verificar su firma
  // con el JSON que envió el POS; la tabla solo se escribe con service_role. No se
  // vuelve a verificar la firma: jsonb reordena las claves y el V2 dejaba de
  // validar, con el pago ya cobrado en TUU (QA PRO2 2026-10-19). Se exige que
  // corresponda al intento (ticket y monto).
  const snapshot = attempt.charge_snapshot;
  const problem = storedChargeSnapshotProblem(snapshot, attempt);
  if (problem) return fail(problem.error, problem.status, { code: problem.code });
  const confirmedQuote = quoteFromChargeSnapshot(snapshot);
  // El mismo código que el POS ya imprimió al aprobar TUU (si fue reservado).
  const paymentCode = reservedPaymentCodeFrom(snapshot) || code("PAG");
  const redeemedAt = new Date().toISOString();
  const alreadyPaid = attempt.status === CARD_ATTEMPT_STATUS.PAID;
  if (!alreadyPaid && confirmedQuote.coupon) {
    const { data: redeemed, error: redeemError } = await current.db.from("coupons").update({ status: "REDEEMED", redeemed_at: redeemedAt, redeemed_by: current.actor.id, redeemed_stay_id: attempt.stay_id }).eq("id", confirmedQuote.coupon.id).eq("status", "ACTIVE").is("redeemed_at", null).select("id").maybeSingle();
    if (redeemError || !redeemed) return fail("El cupón ya fue utilizado o dejó de estar disponible.", 409);
  }
  let stay;
  try {
    stay = await registerCardPaymentAttempt(current.db, {
      attemptId, companyId, operatorId: current.actor.id, operatorName: current.actor.name, shiftId: posShift.id,
      payment: paymentFromChargeSnapshot(snapshot, { paymentCode, tuu: sanitizeTuuCardDetails(input?.cardPayment?.tuu) }),
    });
  } catch (error) {
    if (!alreadyPaid && confirmedQuote.coupon) {
      await current.db.from("coupons").update({ status: "ACTIVE", redeemed_at: null, redeemed_by: null, redeemed_stay_id: null }).eq("id", confirmedQuote.coupon.id).eq("status", "REDEEMED").eq("redeemed_stay_id", attempt.stay_id).eq("redeemed_at", redeemedAt);
    }
    const mapped = cardAttemptErrorResponse(error);
    log("REGISTRATION_FAILED", { code: mapped?.code || error?.code || null });
    if (mapped) return fail(mapped.error, mapped.status, { code: mapped.code });
    if (String(error?.message || "").includes("PAYMENT_SHIFT_NOT_OPEN")) return fail("El turno dejó de estar abierto antes de registrar el pago. Actualiza el POS.", 409, { code: "PAYMENT_SHIFT_NOT_OPEN" });
    return fail("No fue posible registrar el pago.", 503, { code: "CARD_ATTEMPT_FAILED" });
  }
  if (!stay) return fail("No fue posible registrar el pago.", 503, { code: "CARD_ATTEMPT_FAILED" });
  if (!alreadyPaid) await recordReleasedSecondsForCard(current.db, stay.id, snapshot?.calculatedAt);
  const { data: parking } = await current.db.from("parkings").select(ticketParkingFields).eq("id", stay.parking_id).single();
  const publicStay = Object.fromEntries(publicStayFields.split(",").map((field) => [field, stay[field] ?? null]));
  log("REGISTERED", { stayId: stay.id, ticket: stay.code, plate: stay.license_plate, total: stay.total_amount, cardType: stay.payment_card_type, reference: stay.card_payment_reference || null, registration: stay.card_payment_registration || null, alreadyPaid });
  return NextResponse.json({ data: {
    stay: { ...publicStay, payment_card_type: stay.payment_card_type, card_last4: stay.card_last4 ?? null, card_type_selected: stay.card_type_selected ?? null },
    parking,
    quote: { ...confirmedQuote, paymentCode: stay.payment_code },
    cardPaymentRegistration: stay.card_payment_registration || null,
    alreadyRegistered: alreadyPaid,
  } });
}

const UNPAID_ERROR_MESSAGES = {
  CARD_PAYMENT_ATTEMPT_ACTIVE: CARD_ATTEMPT_ACTIVE_MESSAGE,
  UNPAID_SHIFT_NOT_OPEN: "El turno ya no está abierto. Actualiza el POS.",
  UNPAID_SHIFT_OPERATOR_MISMATCH: "La marca debe hacerla el operador del turno abierto.",
  UNPAID_SHIFT_PARKING_MISMATCH: "El turno no corresponde a este estacionamiento.",
  UNPAID_REVERT_SHIFT_NOT_OPEN: "Solo puedes revertir la marca mientras el turno siga abierto.",
};
function unpaidErrorResponse(error, fallback) {
  const message = String(error?.message || "");
  const code = Object.keys(UNPAID_ERROR_MESSAGES).find((key) => message.includes(key));
  if (code) return fail(UNPAID_ERROR_MESSAGES[code], 409, { code });
  if (error?.code === "23505") return fail("La patente ya tiene otro ingreso abierto en este estacionamiento.", 409, { code: "VEHICLE_ALREADY_INSIDE" });
  console.error("[data-entry:unpaid]", { code: error?.code, message });
  return fail(fallback, 503);
}

export async function POST(request) {
  // Un cuerpo inválido nunca debe producir un 500 antes de validar la sesión
  // (Fase 1): se trata como vacío y cae en "Acción operacional no
  // reconocida" tras la autorización.
  const input = (await request.json().catch(() => null)) || {};
  const current = await context(request); if (current.response) return current.response;
  const isPosRequest = String(request.headers.get("x-parkfacil-portal") || "").toLowerCase() === "terminal";
  const posShift = isPosRequest ? await requireOpenPosShift(current.db, current.actor) : null;
  if (isPosRequest && !posShift && ["ENTRY", "EXIT", "RELEASED_EXIT"].includes(input.action)) {
    return fail("Debes iniciar un turno antes de realizar esta operación en el POS.", 409, { code: "OPEN_SHIFT_REQUIRED" });
  }
  if (input.action === "RELEASED_CHECK") {
    const plate = formatChileanPlate(input.plate || joinChileanPlate(input.platePrefix, input.plateSuffix));
    if (!plate) return fail("Ingresa una patente válida.", 400, { plate: "Formato requerido: CXPY93", code: "INVALID_PLATE" });
    const result = await releasedEntryDecision(current.db, current.actor.parkingId, plate);
    return NextResponse.json({ data: releasedCheckPayload(plate, result) });
  }
  // D2 (SOL-2026-10-18-001): donde el pago con tarjeta está apagado (producción), el POS no
  // reserva ni registra cobros con tarjeta.
  if (isPosRequest && !posCardPaymentsEnabled() && (["CARD_PAYMENT_RESERVE", "CARD_PAYMENT_SENT", "CARD_PAYMENT_RESULT"].includes(input.action) || (input.action === "EXIT" && input.paymentMethod === "CARD"))) {
    return fail("El pago con tarjeta no está disponible en este POS. Cobra en efectivo.", 403, { code: "CARD_PAYMENTS_DISABLED" });
  }
  if (["CARD_PAYMENT_RESERVE", "CARD_PAYMENT_SENT", "CARD_PAYMENT_RESULT"].includes(input.action)) {
    return handleCardPaymentAttemptAction({ input, current, isPosRequest, posShift });
  }
  // Pago con tarjeta desde el POS: solo por intento reservado (nunca un
  // registro directo que eluda la reserva).
  if (input.action === "EXIT" && input.paymentMethod === "CARD" && isPosRequest) {
    return registerCardPaymentFromAttempt({ input, current, posShift });
  }
  if (input.action === "ENTRY") {
    const plate = formatChileanPlate(input.plate || joinChileanPlate(input.platePrefix, input.plateSuffix));
    if (!plate) return fail("Ingresa una patente válida.", 400, { plate: "Formato requerido: CXPY93", code: "INVALID_PLATE" });
    const assignedParkingId = current.actor.parkingId;

    // Fase 6: fotografía de patente. Orden exigido por el encargo (§7) —
    // fotografía -> upload -> creación de parking_stay -> ticket ->
    // impresión — precisamente para que un upload fallido en modo REQUIRED
    // nunca termine con un ingreso a medias. Si la tabla de configuración
    // todavía no existe en este ambiente (migración pendiente), se asume
    // DISABLED -- el ENTRY nunca debe romperse por esto (§12: compatibilidad
    // 100% cuando la función está desactivada).
    const basePlatePhotoSettings = await getPlatePhotoSettings(current.db, assignedParkingId).catch(() => ({ plateMode: "DISABLED", printOnTicket: false, gpsMode: "DISABLED" }));
    // Pago liberado: una patente liberada exige foto nueva en cada ingreso,
    // aunque el estacionamiento tenga la foto desactivada u opcional.
    const releasedEntry = await releasedEntryDecision(current.db, assignedParkingId, plate);
    const releasedEligible = releasedEntry.decision === ENTRY_DECISION.ELIGIBLE;
    if (input.expectReleased === true && !releasedEligible) {
      return fail(releasedEntry.message || "La patente ya no califica como liberada. Vuelve a validarla.", 409, { code: "RELEASED_PAYMENT_CHANGED", releasedPayment: releasedCheckPayload(plate, releasedEntry) });
    }
    const platePhotoSettings = releasedEligible ? { ...basePlatePhotoSettings, plateMode: "REQUIRED" } : basePlatePhotoSettings;
    const decodedPhoto = decodePlatePhotoInput(input);
    if (decodedPhoto?.error) return fail("La fotografía enviada no es válida.", 400, { code: decodedPhoto.error });
    if (!canCompleteEntry(platePhotoSettings.plateMode, Boolean(decodedPhoto))) {
      return fail(entryPhotoRequirementMessage(platePhotoSettings.plateMode), 400, { code: "PLATE_PHOTO_REQUIRED" });
    }
    if (decodedPhoto) {
      const validation = validatePlatePhotoFile({ mimeType: decodedPhoto.mimeType, sizeBytes: decodedPhoto.sizeBytes });
      if (!validation.valid) {
        if (platePhotoSettings.plateMode === "REQUIRED") return fail(validation.message, 400, { code: validation.code });
        // OPTIONAL: una foto inválida nunca bloquea el ingreso -- se
        // descarta y se continúa exactamente como si no se hubiese
        // adjuntado ninguna (§4 del encargo).
        decodedPhoto.discard = true;
      }
    }

    // Ajuste final, §18/§19: GPS solo se exige cuando efectivamente va a
    // existir evidencia (si no hay foto -- OPTIONAL sin adjuntar, o se
    // descartó arriba -- no hay nada a lo que asociarle una posición, así
    // que la regla de GPS no aplica). Se valida ANTES de subir el archivo
    // (mismo criterio que la validación de mime/tamaño): nunca se sube nada
    // al bucket si la evidencia de todas formas no va a quedar completa.
    const gpsInput = decodePlateGpsInput(input);
    if (decodedPhoto && !decodedPhoto.discard) {
      const hasValidGps = gpsInput.latitude !== null && gpsInput.longitude !== null;
      if (!canCompleteEvidenceGps(platePhotoSettings.gpsMode, hasValidGps)) {
        return fail(gpsRequirementMessage(platePhotoSettings.gpsMode), 400, { code: "PLATE_PHOTO_GPS_REQUIRED" });
      }
    }

    // Ubicación en calle (SOL-2026-10-23-001): tramo y número opcionales; fuera de la
    // asignación del operador se permite y se marca. El cupo lo controla la base.
    let streetLocation = null;
    if (input.segmentId || (input.streetNumber !== undefined && input.streetNumber !== null && String(input.streetNumber).trim() !== "")) {
      let streetData;
      try { streetData = await loadStreetLocationData(current.db, assignedParkingId); } catch { return fail("No fue posible validar el tramo.", 503); }
      const resolved = resolveEntryStreetLocation({
        segments: streetData.segments,
        activeAssignments: activeOperatorAssignments(streetData.assignments, current.actor.id, operationalClock()),
        segmentId: input.segmentId,
        streetNumber: input.streetNumber,
      });
      if (resolved.error) { const known = STREET_LOCATION_ERRORS[resolved.error]; return fail(known.message, known.status, { code: resolved.error }); }
      streetLocation = resolved.location;
      if (streetLocation && Number(streetData.occupancy[streetLocation.segment_id] || 0) >= Number(streetData.segments.find((item) => item.id === streetLocation.segment_id)?.capacity || 0)) {
        return fail(STREET_LOCATION_ERRORS.STREET_SEGMENT_FULL.message, 409, { code: "STREET_SEGMENT_FULL" });
      }
    }

    const existing = await current.db
      .from("parking_stays")
      .select(publicStayFields)
      .eq("parking_id", assignedParkingId)
      .eq("license_plate", plate)
      .eq("status", "OPEN")
      .maybeSingle();
    if (existing.error) return fail("No fue posible validar la entrada del vehículo.", 503);
    if (existing.data) return fail("Este vehículo ya se encuentra dentro del estacionamiento.", 409, { code: "VEHICLE_ALREADY_INSIDE" });

    let uploadedPhoto = null;
    if (decodedPhoto && !decodedPhoto.discard) {
      try {
        uploadedPhoto = await uploadPlateEntryPhoto(current.db, {
          parkingId: assignedParkingId,
          buffer: decodedPhoto.buffer,
          mimeType: decodedPhoto.mimeType,
          sizeBytes: decodedPhoto.sizeBytes,
        });
      } catch (uploadError) {
        console.error("[data-entry:ENTRY:plate-photo:upload]", { code: uploadError?.code, message: uploadError?.message });
        if (platePhotoSettings.plateMode === "REQUIRED") {
          return fail("No fue posible subir la fotografía de la patente. Intenta nuevamente.", 503, { code: "PLATE_PHOTO_UPLOAD_FAILED" });
        }
        // OPTIONAL: se continúa sin fotografía, nunca se bloquea el ingreso.
      }
    }

    const row = { code: code("ING"), parking_id: assignedParkingId, license_plate: plate, entry_operator_id: current.actor.id, entry_operator_name: current.actor.name, entry_source: isPosRequest ? "POS" : "WEB", entry_shift_id: isPosRequest ? posShift.id : null, ...(streetLocation && !releasedEligible ? streetLocation : {}) };
    let data;
    let error;
    if (releasedEligible) {
      // Pago, vigencia, cupo, módulo y duplicados se re-verifican en la base
      // con bloqueo por estacionamiento (dos ingresos simultáneos nunca
      // superan los cupos del cliente).
      const registered = releasedEntry.model === "CLIENT"
        ? await current.db.rpc("released_plate_register_entry", {
          p_parking_id: assignedParkingId,
          p_authorization_id: releasedEntry.authorization.id,
          p_snapshot: releasedEntry.snapshot,
          p_stay: row,
        })
        : await current.db.rpc("released_payment_register_entry", {
          p_parking_id: assignedParkingId,
          p_authorization_id: releasedEntry.authorization.id,
          p_contract_id: releasedEntry.contract.id,
          p_snapshot: releasedEntry.snapshot,
          p_stay: row,
        });
      error = registered.error;
      // El registro de patente liberada no conoce la ubicación en calle: se agrega
      // después (el trigger revalida cupo y coherencia del tramo).
      if (!error && streetLocation) {
        const located = await current.db.from("parking_stays").update(streetLocation).eq("id", registered.data.id);
        if (located.error) console.error("[data-entry:ENTRY:released:street-location]", { code: located.error.code, message: located.error.message });
      }
      if (!error) {
        const reloaded = await current.db.from("parking_stays").select(publicStayFields).eq("id", registered.data.id).single();
        data = reloaded.data;
        error = reloaded.error;
      }
    } else {
      ({ data, error } = await current.db.from("parking_stays").insert(row).select(publicStayFields).single());
    }
    if (error) {
      if (uploadedPhoto) await removeOrphanedPlatePhoto(current.db, uploadedPhoto.storagePath);
      const releasedCode = releasedEligible ? releasedEntryErrorCode(error) : null;
      if (releasedCode && RELEASED_ENTRY_ERRORS[releasedCode]) {
        return fail(RELEASED_ENTRY_ERRORS[releasedCode], 409, { code: RELEASED_DUPLICATE_CODES.has(releasedCode) ? "VEHICLE_ALREADY_INSIDE" : "RELEASED_PAYMENT_CHANGED", releasedCode });
      }
      if (error.code === "23505") return fail("Este vehículo ya se encuentra dentro del estacionamiento.", 409, { code: "VEHICLE_ALREADY_INSIDE" });
      const locationCode = streetLocationErrorCode(error);
      if (locationCode) return fail(STREET_LOCATION_ERRORS[locationCode].message, STREET_LOCATION_ERRORS[locationCode].status, { code: locationCode });
      return fail("No fue posible guardar el ingreso.", 503);
    }

    let photoLinked = false;
    let photoLinkFailed = false;
    if (uploadedPhoto) {
      try {
        await linkPlateEntryPhoto(current.db, {
          companyId: current.parking.companyId,
          parkingId: assignedParkingId,
          parkingStayId: data.id,
          storagePath: uploadedPhoto.storagePath,
          mimeType: uploadedPhoto.mimeType,
          sizeBytes: uploadedPhoto.sizeBytes,
          createdBy: current.actor.id,
          sha256: uploadedPhoto.sha256,
          capturedAt: sanitizeCapturedAt(input.platePhotoCapturedAt),
          latitude: gpsInput.latitude,
          longitude: gpsInput.longitude,
          gpsAccuracyM: gpsInput.accuracy,
          deviceInfo: sanitizeDeviceInfo(input.deviceInfo),
        });
        photoLinked = true;
      } catch (linkError) {
        // La permanencia ya es un evento de negocio real (el vehículo ya
        // fue registrado) -- no se revierte por un fallo de metadata de la
        // foto (ver nota de diseño en platePhotoEvidenceRepository.js). Se
        // reporta como advertencia, nunca como fallo del ingreso.
        console.error("[data-entry:ENTRY:plate-photo:link]", { code: linkError?.code, message: linkError?.message, stayId: data.id });
        photoLinkFailed = true;
      }
    }

    const { data: parking } = await current.db.from("parkings").select(ticketParkingFields).eq("id", assignedParkingId).single();
    const debtNotice = await entryDebtNotice(current.db, current.parking, plate);
    return NextResponse.json({
      data: {
        stay: data,
        parking,
        debtNotice,
        platePhoto: { mode: platePhotoSettings.plateMode, printOnTicket: platePhotoSettings.printOnTicket, hasPhoto: photoLinked, linkFailed: photoLinkFailed },
        releasedPayment: releasedEligible
          ? releasedEntry.model === "CLIENT"
            ? { applied: true, label: releasedEntry.snapshot.ticket.label, detail: releasedEntry.snapshot.ticket.detail, authorization: releasedCheckPayload(plate, releasedEntry).authorization, spots: null }
            : { applied: true, label: "PAGO LIBERADO", authorization: releasedCheckPayload(plate, releasedEntry).authorization, spots: { used: (releasedEntry.spots?.used || 0) + 1, total: releasedEntry.spots?.total || null } }
          : releasedEntry.decision !== ENTRY_DECISION.NOT_AUTHORIZED ? { applied: false, message: releasedEntry.message || null } : null,
      },
    }, { status: 201 });
  }
  if (["QUOTE", "EXIT"].includes(input.action)) {
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
    const now = new Date();
    const releasedSnapshot = await loadReleasedStaySnapshot(current.db, stay.id);
    if (input.couponToken && !couponsEnabled()) return fail(COUPONS_DISABLED_ERROR.error, 403, { code: COUPONS_DISABLED_ERROR.code });
    // Módulo Cupones activo (etapa C): cobrar con cupón (couponToken o cálculo firmado con cupón).
    if ((input.couponToken || (input.action === "EXIT" && input.quoteSnapshot?.couponId)) && !(await couponsActiveForParking(current.db, stay.parking_id))) {
      return fail(COUPON_MODULE_INACTIVE_ERROR.error, 403, { code: COUPON_MODULE_INACTIVE_ERROR.code });
    }
    if (releasedSnapshot && input.couponToken) return fail("Los cupones no aplican a patentes liberadas.", 409, { code: "RELEASED_PAYMENT_NO_COUPON" });
    let quote; try { quote = releasedSnapshot ? await quoteReleasedParkingStay(current.db, stay, releasedSnapshot, { now }) : await quoteParkingStay(current.db, stay, { couponToken: input.couponToken, now }); } catch (error) {
      const messages = { PARKING_NOT_FOUND: "El estacionamiento no existe.", COUPON_NOT_FOUND: "El cupón no existe.", COUPON_ALREADY_USED: "El cupón ya fue utilizado.", COUPON_INACTIVE: "El cupón no está activo.", COUPON_WRONG_COMPANY: "El cupón no corresponde a este estacionamiento.", COUPON_NOT_YET_VALID: "El cupón todavía no está vigente.", COUPON_EXPIRED: "El cupón está vencido." };
      return fail(messages[error.message] || "No fue posible calcular la tarifa.", 409);
    }
    const { data: parking } = await current.db.from("parkings").select(ticketParkingFields).eq("id", stay.parking_id).single();
    // Sin tarifa válida: el vehículo/ticket/permanencia SÍ se devuelven (200), solo se
    // bloquea el cálculo/cobro. Un intento de EXIT igual se rechaza (defensa adicional;
    // la UI ya no ofrece el botón de pago en este estado).
    if (quote.blocked) {
      if (input.action === "EXIT") return fail("No existe una tarifa activa. No es posible calcular el cobro. Contacte al administrador.", 409);
      return NextResponse.json({ data: { stay, parking, quote } });
    }
    // Patente liberada sin tiempo cobrable: no hay cobro; la salida se
    // registra con RELEASED_EXIT (libera el cupo).
    if (releasedSnapshot && quote.total === 0) {
      if (input.action === "EXIT") return fail("Patente liberada sin excedente: registra la salida sin cobro.", 409, { code: "RELEASED_EXIT_REQUIRED" });
      return NextResponse.json({ data: { stay, parking, quote: { ...quote, releasedExit: true } } });
    }
    if (input.action === "QUOTE") {
      const quoteWithSnapshot = isPosRequest && !quote.blocked
        ? { ...quote, snapshot: buildPosQuoteSnapshot({ stay, quote, calculatedAt: now }) }
        : quote;
      return NextResponse.json({ data: { stay, parking, quote: quoteWithSnapshot } });
    }
    if (!['CASH','CARD'].includes(input.paymentMethod)) return fail("Selecciona contado o tarjeta.");
    // D2 (SOL-2026-10-18-001): el POS no registra pagos con tarjeta donde están apagados (producción).
    if (isPosRequest && input.paymentMethod === "CARD" && !posCardPaymentsEnabled()) {
      return fail("El pago con tarjeta no está disponible en este POS. Cobra en efectivo.", 403, { code: "CARD_PAYMENTS_DISABLED" });
    }
    // Un ticket con un pago con tarjeta en curso, aprobado sin registrar o
    // incierto no puede pagarse por otro medio.
    let blockingAttempt = null;
    try { blockingAttempt = await activeCardAttemptOrNull(current.db, stay.id); }
    catch { return fail("No fue posible cerrar y pagar la estadía.", 503); }
    if (blockingAttempt) return fail(CARD_ATTEMPT_ACTIVE_MESSAGE, 409, { code: "CARD_PAYMENT_ATTEMPT_ACTIVE" });
    let paymentCardType;
    try { paymentCardType = validatePaymentCardType(input.paymentMethod, input.paymentCardType); }
    catch { return fail("El tipo de tarjeta no es válido.", 400, { code: "INVALID_PAYMENT_CARD_TYPE" }); }
    if (paymentCardType && !(await canCaptureCardType(current.db, stay.parking_id))) {
      return fail("Falta habilitar el registro de Crédito y Débito.", 503, { code: "CARD_TYPE_SCHEMA_UNAVAILABLE" });
    }
    // Referencia TUU (sequenceNumber) del cobro ya realizado: opcional; si la
    // columna aún no existe, la salida se registra sin ella.
    let cardPaymentReference;
    try { cardPaymentReference = validateCardPaymentReference(input.paymentMethod, input.cardPayment); }
    catch { return fail("La referencia del pago con tarjeta no es válida.", 400, { code: "CARD_PAYMENT_REFERENCE_INVALID" }); }
    if (cardPaymentReference) {
      let referenceStorable = false;
      try { referenceStorable = await canStoreCardPaymentReference(current.db); }
      catch { return fail("No fue posible cerrar y pagar la estadía.", 503); }
      if (!referenceStorable) {
        console.warn("[data-entry:card-reference]", { status: "SCHEMA_UNAVAILABLE", provider: cardPaymentReference.provider, reference: cardPaymentReference.reference });
        cardPaymentReference = null;
      }
    }
    const quoteSnapshot = input.quoteSnapshot || null;
    const quoteSecret = process.env.POS_QUOTE_HMAC_SECRET;
    const quoteExpiresAt = quoteSnapshot?.expiresAt ? new Date(quoteSnapshot.expiresAt) : null;
    if (!quoteSnapshot?.signature) {
      return fail("El cálculo de cobro expiró o no es válido. Actualiza el vehículo para obtener el monto a pagar.", 409, { code: "QUOTE_SNAPSHOT_REQUIRED" });
    }
    if (!quoteExpiresAt || Number.isNaN(quoteExpiresAt.getTime()) || quoteExpiresAt <= now) {
      return fail("El cálculo de cobro expiró. Actualiza el vehículo para obtener el monto a pagar.", 409, { code: "QUOTE_SNAPSHOT_EXPIRED" });
    }
    if (quoteSnapshot.stayId !== stay.id || quoteSnapshot.parkingId !== stay.parking_id || quoteSnapshot.stayUpdatedAt !== stay.updated_at) {
      return fail("El cálculo de cobro ya no corresponde a este ticket. Actualiza el vehículo para obtener el monto a pagar.", 409, { code: "QUOTE_SNAPSHOT_STALE" });
    }
    if (!quoteSecret) {
      return fail("La validación del cálculo de cobro no está configurada.", 503, { code: "QUOTE_SIGNATURE_UNAVAILABLE" });
    }
    let quoteSnapshotValid = false;
    try {
      quoteSnapshotValid = verifyPosQuoteSnapshot(quoteSnapshot, quoteSnapshot.signature, quoteSecret);
    } catch {
      quoteSnapshotValid = false;
    }
    if (!quoteSnapshotValid) {
      return fail("El cálculo de cobro no pudo validarse. Actualiza el vehículo para obtener el monto a pagar.", 409, { code: "QUOTE_SNAPSHOT_INVALID" });
    }
    const confirmedQuote = {
      blocked: false,
      elapsedMinutes: Number.isFinite(Number(quoteSnapshot.elapsedMinutes)) ? Number(quoteSnapshot.elapsedMinutes) : null,
      subtotal: Number(quoteSnapshot.subtotalAmount || 0),
      discount: Number(quoteSnapshot.discountAmount || 0),
      net: Number(quoteSnapshot.netAmount || 0),
      tax: Number(quoteSnapshot.taxAmount || 0),
      total: Number(quoteSnapshot.totalAmount || 0),
      rate: {
        id: quoteSnapshot.rateId || null,
        name: quoteSnapshot.rateName || stay.rate_name || null,
        billingMode: quoteSnapshot.billingMode || stay.billing_mode || null,
        currency: quoteSnapshot.currency || "CLP",
      },
      coupon: quoteSnapshot.couponId ? {
        id: quoteSnapshot.couponId,
        code: quoteSnapshot.couponCode || null,
        benefitType: quoteSnapshot.couponBenefitType || null,
        value: Number.isFinite(Number(quoteSnapshot.couponBenefitValue)) ? Number(quoteSnapshot.couponBenefitValue) : null,
      } : null,
      snapshot: quoteSnapshot,
    };
    const exitAt = new Date().toISOString(); const paymentCode = code("PAG");
    if (confirmedQuote.coupon) {
      const { data: redeemed, error: redeemError } = await current.db.from("coupons").update({ status: "REDEEMED", redeemed_at: exitAt, redeemed_by: current.actor.id, redeemed_stay_id: stay.id }).eq("id", confirmedQuote.coupon.id).eq("status", "ACTIVE").is("redeemed_at", null).select("id").maybeSingle();
      if (redeemError || !redeemed) return fail("El cupón ya fue utilizado o dejó de estar disponible.", 409);
    }
    const update = { status: "PAID", exit_at: exitAt, exit_operator_id: current.actor.id, exit_operator_name: current.actor.name, payment_shift_id: isPosRequest ? posShift.id : null, elapsed_minutes: confirmedQuote.elapsedMinutes, rate_id: confirmedQuote.rate.id, rate_name: confirmedQuote.rate.name, billing_mode: confirmedQuote.rate.billingMode, subtotal_amount: confirmedQuote.subtotal, discount_amount: confirmedQuote.discount, coupon_id: confirmedQuote.coupon?.id || null, coupon_code: confirmedQuote.coupon?.code || null, net_amount: confirmedQuote.net, tax_amount: confirmedQuote.tax, total_amount: confirmedQuote.total, payment_method: input.paymentMethod, payment_code: paymentCode, updated_at: exitAt };
    if (paymentCardType) update.payment_card_type = paymentCardType;
    // Pago liberado: tiempo cubierto y cobrado (el monto viene firmado).
    if (releasedSnapshot && quote.released) {
      update.released_covered_seconds = quote.released.coveredSeconds;
      update.released_chargeable_seconds = quote.released.chargeableSeconds;
    }
    // Desglose por franja: solo el que viene firmado (cotización V2).
    if (snapshotHasChargeBreakdown(quoteSnapshot)) update.charge_breakdown = quoteSnapshot.chargeBreakdown;
    if (cardPaymentReference) {
      update.card_payment_provider = cardPaymentReference.provider;
      update.card_payment_reference = cardPaymentReference.reference;
    }
    const { data, error } = await current.db.from("parking_stays").update(update).eq("id", stay.id).eq("status", "OPEN").select(publicStayFields).single();
    if (error) {
      if (confirmedQuote.coupon) {
        await current.db.from("coupons").update({ status: "ACTIVE", redeemed_at: null, redeemed_by: null, redeemed_stay_id: null }).eq("id", confirmedQuote.coupon.id).eq("status", "REDEEMED").eq("redeemed_stay_id", stay.id).eq("redeemed_at", exitAt);
      }
      if (String(error.message || "").includes("CARD_PAYMENT_ATTEMPT_ACTIVE")) return fail(CARD_ATTEMPT_ACTIVE_MESSAGE, 409, { code: "CARD_PAYMENT_ATTEMPT_ACTIVE" });
      const shiftConflict = String(error.message || "").includes("PAYMENT_SHIFT_NOT_OPEN");
      return fail(shiftConflict ? "El turno dejó de estar abierto antes de confirmar el pago. Actualiza el POS." : "No fue posible cerrar y pagar la estadía.", shiftConflict ? 409 : 503);
    }
    // Boleta electrónica del pago en efectivo del POS (SOL-2026-10-20-001): se
    // emite con el pago ya registrado; si Haulmer falla, el pago no se revierte.
    const boleta = isPosRequest && input.paymentMethod === "CASH" ? await issueCashPaymentBoleta(current.db, data).catch(() => null) : null;
    return NextResponse.json({ data: { stay: { ...data, payment_card_type: paymentCardType }, parking, quote: { ...confirmedQuote, paymentCode }, ...(boleta ? { boleta } : {}) } });
  }
  // Pago liberado: salida sin cobro (todo el tiempo cubierto). Libera el cupo.
  if (input.action === "RELEASED_EXIT") {
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
    const now = new Date();
    const releasedSnapshot = await loadReleasedStaySnapshot(current.db, stay.id);
    if (!releasedSnapshot) return fail("La estadía no corresponde a una patente liberada.", 409, { code: "NOT_RELEASED_STAY" });
    const quote = await quoteReleasedParkingStay(current.db, stay, releasedSnapshot, { now });
    if (quote.blocked || quote.total > 0) {
      return fail("La estadía tiene tiempo fuera de la autorización: corresponde cobrar el excedente con la tarifa del estacionamiento.", 409, { code: "RELEASED_EXCESS_DUE" });
    }
    const exitAt = now.toISOString(); const paymentCode = code("LIB");
    const update = {
      status: "PAID", exit_at: exitAt, exit_operator_id: current.actor.id, exit_operator_name: current.actor.name,
      payment_shift_id: isPosRequest ? posShift.id : null, elapsed_minutes: quote.elapsedMinutes,
      subtotal_amount: 0, discount_amount: 0, net_amount: 0, tax_amount: 0, total_amount: 0, payment_method: null,
      payment_code: paymentCode, released_covered_seconds: quote.released.coveredSeconds, released_chargeable_seconds: 0, updated_at: exitAt,
    };
    const { data, error } = await current.db.from("parking_stays").update(update).eq("id", stay.id).eq("status", "OPEN").select(publicStayFields).single();
    if (error) {
      const shiftConflict = String(error.message || "").includes("PAYMENT_SHIFT_NOT_OPEN");
      return fail(shiftConflict ? "El turno dejó de estar abierto antes de registrar la salida. Actualiza el POS." : "No fue posible registrar la salida.", shiftConflict ? 409 : 503);
    }
    const { data: parking } = await current.db.from("parkings").select(ticketParkingFields).eq("id", stay.parking_id).single();
    return NextResponse.json({ data: { stay: data, parking, quote: { ...quote, paymentCode, releasedExit: true } } });
  }

  if (input.action === "UNPAID_EXIT") {
    // "Se retiró sin pagar" (D8, D12, D15): solo desde el POS con turno abierto.
    // El cupo se libera y el contador sigue hasta el cierre del turno.
    if (!isPosRequest || !posShift) return fail("Debes iniciar un turno en el POS para registrar una salida sin pago.", 409, { code: "OPEN_SHIFT_REQUIRED" });
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
    let unpaidBlockingAttempt = null;
    try { unpaidBlockingAttempt = await activeCardAttemptOrNull(current.db, stay.id); }
    catch { return fail("No fue posible registrar la salida sin pago.", 503); }
    if (unpaidBlockingAttempt) return fail(CARD_ATTEMPT_ACTIVE_MESSAGE, 409, { code: "CARD_PAYMENT_ATTEMPT_ACTIVE" });
    let marked;
    try {
      marked = await markStayUnpaid(current.db, { stayId: stay.id, parkingId: current.actor.parkingId, actor: current.actor, shiftId: posShift.id, notes: sanitizeUnpaidNotes(input.notes) });
    } catch (error) {
      return unpaidErrorResponse(error, "No fue posible registrar la salida sin pago.");
    }
    if (!marked) return fail("La estadía cambió mientras se registraba. Actualiza el POS.", 409, { code: "STAY_CHANGED" });
    return NextResponse.json({ data: { stay: marked } });
  }
  if (input.action === "UNPAID_REVERT") {
    if (!isPosRequest || !posShift) return fail("Debes tener el turno abierto para revertir la marca.", 409, { code: "OPEN_SHIFT_REQUIRED" });
    const pending = await getPendingUnpaidStay(current.db, { stayId: input.stayId, parkingId: current.actor.parkingId });
    if (!pending) return fail("No existe una salida sin pago pendiente para revertir.", 404);
    if (!canRevertUnpaidMark({ stay: pending, actorId: current.actor.id, isAdmin: current.actor.role !== ROLES.OPERATOR })) {
      return fail("Solo quien registró la salida sin pago puede revertirla.", 403, { code: "UNPAID_REVERT_FORBIDDEN" });
    }
    let reverted;
    try {
      reverted = await revertStayUnpaid(current.db, { stayId: pending.id, parkingId: current.actor.parkingId });
    } catch (error) {
      return unpaidErrorResponse(error, "No fue posible revertir la salida sin pago.");
    }
    if (!reverted) return fail("La estadía cambió mientras se revertía. Actualiza el POS.", 409, { code: "STAY_CHANGED" });
    return NextResponse.json({ data: { stay: reverted } });
  }
  return fail("Acción operacional no reconocida.");
}
