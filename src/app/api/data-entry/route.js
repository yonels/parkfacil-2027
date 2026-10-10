import { canCaptureCardType, validatePaymentCardType } from "@/lib/paymentCardType.mjs";
import { canStoreCardPaymentReference, validateCardPaymentReference } from "@/lib/pos/cardPaymentReference.mjs";
import { canRevertUnpaidMark, sanitizeUnpaidNotes } from "@/lib/parkingDebtsCore.mjs";
import { buildDebtNoticeForPlate, getPendingUnpaidStay, listPendingUnpaidStaysForShift, markStayUnpaid, revertStayUnpaid } from "@/lib/parkingDebtsRepository";
import { getDebtNoticeEnabled } from "@/lib/offStreet/debtNoticeSettingsRepository";
import { NextResponse } from "next/server";
import { formatChileanPlate, joinChileanPlate } from "@/lib/dataEntry.mjs";
import { buildPosQuoteSnapshot, quoteParkingStay, verifyPosQuoteSnapshot } from "@/lib/parkingStayQuoteService";
import { authorizeOperationRequest, operationAuthorizationError, posOperationActor, posParkingSelectionRequiredResponse, requireOperationalParking, resolvePosOperationalParking } from "@/lib/auth/operationAuthorization";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { isRequestedParkingConsistent, POS_PARKING_RESOLUTION } from "@/lib/pos/posParkingResolution.mjs";
import { getPlatePhotoSettings } from "@/lib/offStreet/offStreetPlatePhotoSettingsRepository";
import { linkPlateEntryPhoto, removeOrphanedPlatePhoto, uploadPlateEntryPhoto } from "@/lib/offStreet/platePhotoEvidenceRepository";
import { canCompleteEntry, canCompleteEvidenceGps, entryPhotoRequirementMessage, gpsRequirementMessage, validatePlatePhotoFile } from "@/lib/offStreet/offStreetPlatePhoto.mjs";

const publicStayFields = "id,code,parking_id,license_plate,qr_token,status,entry_at,entry_operator_name,entry_source,entry_shift_id,exit_at,exit_operator_name,payment_shift_id,elapsed_minutes,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,coupon_id,coupon_code,discount_amount,subtotal_amount,updated_at";
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

const UNPAID_ERROR_MESSAGES = {
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
  if (isPosRequest && !posShift && (input.action === "ENTRY" || input.action === "EXIT")) {
    return fail("Debes iniciar un turno antes de realizar esta operación en el POS.", 409, { code: "OPEN_SHIFT_REQUIRED" });
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
    const platePhotoSettings = await getPlatePhotoSettings(current.db, assignedParkingId).catch(() => ({ plateMode: "DISABLED", printOnTicket: false, gpsMode: "DISABLED" }));
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

    const row = { code: code("ING"), parking_id: assignedParkingId, license_plate: plate, entry_operator_id: current.actor.id, entry_operator_name: current.actor.name, entry_source: isPosRequest ? "POS" : "WEB", entry_shift_id: isPosRequest ? posShift.id : null };
    const { data, error } = await current.db.from("parking_stays").insert(row).select(publicStayFields).single();
    if (error) {
      if (uploadedPhoto) await removeOrphanedPlatePhoto(current.db, uploadedPhoto.storagePath);
      if (error.code === "23505") return fail("Este vehículo ya se encuentra dentro del estacionamiento.", 409, { code: "VEHICLE_ALREADY_INSIDE" });
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
      },
    }, { status: 201 });
  }
  if (["QUOTE", "EXIT"].includes(input.action)) {
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
    const now = new Date();
    let quote; try { quote = await quoteParkingStay(current.db, stay, { couponToken: input.couponToken, now }); } catch (error) {
      const messages = { PARKING_NOT_FOUND: "El estacionamiento no existe.", COUPON_NOT_FOUND: "El cupón no existe.", COUPON_ALREADY_USED: "El cupón ya fue utilizado.", COUPON_WRONG_COMPANY: "El cupón no corresponde a este estacionamiento.", COUPON_NOT_YET_VALID: "El cupón todavía no está vigente.", COUPON_EXPIRED: "El cupón está vencido." };
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
    if (input.action === "QUOTE") {
      const quoteWithSnapshot = isPosRequest && !quote.blocked
        ? { ...quote, snapshot: buildPosQuoteSnapshot({ stay, quote, calculatedAt: now }) }
        : quote;
      return NextResponse.json({ data: { stay, parking, quote: quoteWithSnapshot } });
    }
    if (!['CASH','CARD'].includes(input.paymentMethod)) return fail("Selecciona contado o tarjeta.");
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
      return fail("La cotización del POS venció o no es válida. Actualiza el vehículo y vuelve a cobrar.", 409, { code: "QUOTE_SNAPSHOT_REQUIRED" });
    }
    if (!quoteExpiresAt || Number.isNaN(quoteExpiresAt.getTime()) || quoteExpiresAt <= now) {
      return fail("La cotización del POS venció o no es válida. Actualiza el vehículo y vuelve a cobrar.", 409, { code: "QUOTE_SNAPSHOT_EXPIRED" });
    }
    if (quoteSnapshot.stayId !== stay.id || quoteSnapshot.parkingId !== stay.parking_id || quoteSnapshot.stayUpdatedAt !== stay.updated_at) {
      return fail("La cotización del POS ya no corresponde a esta estadía. Actualiza el vehículo y vuelve a cobrar.", 409, { code: "QUOTE_SNAPSHOT_STALE" });
    }
    if (!quoteSecret) {
      return fail("La firma de cotización POS no está configurada.", 503, { code: "QUOTE_SIGNATURE_UNAVAILABLE" });
    }
    let quoteSnapshotValid = false;
    try {
      quoteSnapshotValid = verifyPosQuoteSnapshot(quoteSnapshot, quoteSnapshot.signature, quoteSecret);
    } catch {
      quoteSnapshotValid = false;
    }
    if (!quoteSnapshotValid) {
      return fail("La cotización del POS fue alterada o no pudo validarse. Actualiza el vehículo y vuelve a cobrar.", 409, { code: "QUOTE_SNAPSHOT_INVALID" });
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
    // Desglose por franja: solo el que viene firmado (cotización V2).
    if (quoteSnapshot.version === "POS_STAY_QUOTE_V2" && quoteSnapshot.chargeBreakdown) update.charge_breakdown = quoteSnapshot.chargeBreakdown;
    if (cardPaymentReference) {
      update.card_payment_provider = cardPaymentReference.provider;
      update.card_payment_reference = cardPaymentReference.reference;
    }
    const { data, error } = await current.db.from("parking_stays").update(update).eq("id", stay.id).eq("status", "OPEN").select(publicStayFields).single();
    if (error) {
      if (confirmedQuote.coupon) {
        await current.db.from("coupons").update({ status: "ACTIVE", redeemed_at: null, redeemed_by: null, redeemed_stay_id: null }).eq("id", confirmedQuote.coupon.id).eq("status", "REDEEMED").eq("redeemed_stay_id", stay.id).eq("redeemed_at", exitAt);
      }
      const shiftConflict = String(error.message || "").includes("PAYMENT_SHIFT_NOT_OPEN");
      return fail(shiftConflict ? "El turno dejó de estar abierto antes de confirmar el pago. Actualiza el POS." : "No fue posible cerrar y pagar la estadía.", shiftConflict ? 409 : 503);
    }
    return NextResponse.json({ data: { stay: { ...data, payment_card_type: paymentCardType }, parking, quote: { ...confirmedQuote, paymentCode } } });
  }
  if (input.action === "UNPAID_EXIT") {
    // "Se retiró sin pagar" (D8, D12, D15): solo desde el POS con turno abierto.
    // El cupo se libera y el contador sigue hasta el cierre del turno.
    if (!isPosRequest || !posShift) return fail("Debes iniciar un turno en el POS para registrar una salida sin pago.", 409, { code: "OPEN_SHIFT_REQUIRED" });
    const stay = await findOpenStay(current.db, input, current.actor.parkingId);
    if (!stay) return fail("No existe una estadía abierta para el vehículo.", 404);
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
