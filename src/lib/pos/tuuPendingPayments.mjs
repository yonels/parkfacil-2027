// Pagos TUU sin cerrar — copia de APOYO en el dispositivo.
//
// Desde la reserva central (SOL-2026-10-11-001) la fuente de verdad de un
// intento de pago con tarjeta es el servidor (tabla pos_card_payment_attempts,
// ver src/lib/pos/cardPaymentAttempts.mjs): el POS reserva el intento ANTES de
// abrir TUU y el bloqueo de un segundo cobro lo decide el servidor, para
// todos los equipos. Lo que se guarda aquí sirve para:
//   - reconocer en ESTE equipo un resultado de TUU que llega tarde o después
//     de recargar la app (TUU no dice a qué ticket corresponde su respuesta);
//   - reintentar el aviso de un resultado que no alcanzó a llegar al servidor;
//   - mostrar el pago pendiente aunque no haya conexión.
// Nunca autoriza por sí solo un cobro ni libera un ticket.
//
// Reglas puras (sin window/DOM): el almacenamiento se inyecta.
//
// Estados locales:
//   IN_PROGRESS           se abrió TUU y aún no hay resultado.
//   UNCERTAIN             no se sabe si TUU cobró.
//   PENDING_REGISTRATION  TUU aprobó; falta registrar el pago en ParkFacil.
//
// Nunca se guarda información de la tarjeta.

import { isValidTuuSequenceNumber } from "./tuuPayment.mjs";

export const TUU_PENDING_STORAGE_KEY = "parkfacil.pos.tuu.pending.v2";
export const TUU_REPORTS_STORAGE_KEY = "parkfacil.pos.tuu.reports.v1";
export const TUU_PROCESSED_STORAGE_KEY = "parkfacil.pos.tuu.processed.v1";
export const POS_DEVICE_STORAGE_KEY = "parkfacil.pos.device.v1";

export const TUU_PENDING_STATUS = Object.freeze({
  IN_PROGRESS: "IN_PROGRESS",
  UNCERTAIN: "UNCERTAIN",
  PENDING_REGISTRATION: "PENDING_REGISTRATION",
});

const STATUSES = new Set(Object.values(TUU_PENDING_STATUS));
const CARD_TYPES = new Set(["DEBIT", "CREDIT"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value, max = 120) {
  if (value === null || value === undefined) return null;
  const out = String(value).trim().slice(0, max);
  return out || null;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    if (!storage?.setItem) return false;
    const serialized = JSON.stringify(value);
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Identificadores generados por el POS
// ---------------------------------------------------------------------------

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function defaultRandomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// Clave de idempotencia de ParkFacil para UN intento de pago (formato UUID v4).
// No usa crypto.randomUUID: el WebView del PRO2 (Chrome 83) no lo tiene.
export function newTuuIdempotencyKey(randomBytes = defaultRandomBytes) {
  const bytes = Uint8Array.from(randomBytes(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

// Identificador de este equipo: se genera una vez y se conserva. Devuelve
// null si no se puede guardar (sin él no se inicia un pago con tarjeta).
export function getOrCreatePosDeviceId(storage, randomBytes = defaultRandomBytes) {
  try {
    const existing = storage?.getItem?.(POS_DEVICE_STORAGE_KEY);
    if (typeof existing === "string" && /^pos-[0-9a-f]{24}$/.test(existing)) return existing;
    const created = `pos-${hex(Uint8Array.from(randomBytes(12)))}`;
    storage.setItem(POS_DEVICE_STORAGE_KEY, created);
    return storage.getItem(POS_DEVICE_STORAGE_KEY) === created ? created : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Registros locales
// ---------------------------------------------------------------------------

// Lista blanca de campos. Cualquier otro dato (incluida la respuesta cruda de
// TUU) se descarta.
export function sanitizeTuuPendingPayment(input) {
  if (!input || typeof input !== "object") return null;
  const stayId = text(input.stayId, 64);
  const amount = Math.round(Number(input.amount));
  const status = STATUSES.has(input.status) ? input.status : null;
  const cardType = CARD_TYPES.has(input.cardType) ? input.cardType : null;
  const attemptId = typeof input.attemptId === "string" && UUID.test(input.attemptId) ? input.attemptId : null;
  // Sin intento reservado en el servidor no existe un pago que seguir.
  if (!stayId || !status || !cardType || !attemptId || !Number.isFinite(amount) || amount <= 0) return null;
  return {
    stayId,
    attemptId,
    idempotencyKey: text(input.idempotencyKey, 80),
    deviceId: text(input.deviceId, 80),
    status,
    cardType,
    amount,
    ticketCode: text(input.ticketCode, 64),
    plate: text(input.plate, 16),
    parkingId: text(input.parkingId, 64),
    parkingName: text(input.parkingName, 120),
    operatorId: text(input.operatorId, 64),
    operatorName: text(input.operatorName, 120),
    shiftId: text(input.shiftId, 64),
    sequenceNumber: isValidTuuSequenceNumber(input.sequenceNumber) ? input.sequenceNumber : null,
    startedAt: isoOrNull(input.startedAt),
    approvedAt: isoOrNull(input.approvedAt),
    uncertainReason: text(input.uncertainReason, 60),
    // Mensaje de error de la app de pago junto a un resultado incierto.
    uncertainDetail: text(input.uncertainDetail, 160),
    registrationAttempts: Math.max(0, Math.round(Number(input.registrationAttempts) || 0)),
    lastRegistrationError: text(input.lastRegistrationError, 200),
  };
}

export function loadTuuPendingPayments(storage) {
  const parsed = readJson(storage, TUU_PENDING_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  const records = [];
  for (const item of parsed) {
    const record = sanitizeTuuPendingPayment(item);
    if (!record || seen.has(record.stayId)) continue;
    seen.add(record.stayId);
    records.push(record);
  }
  return records;
}

// Registro local de un intento (por su identificador). null si este equipo
// no lo tiene (p. ej. se borraron los datos del WebView).
export function findTuuPendingPaymentByAttempt(records, attemptId) {
  const wanted = typeof attemptId === "string" ? attemptId.toLowerCase() : "";
  if (!UUID.test(wanted)) return null;
  return (Array.isArray(records) ? records : []).find((record) => String(record.attemptId || "").toLowerCase() === wanted) || null;
}

export function findTuuPendingPayment(records, stayId) {
  const wanted = text(stayId, 64);
  if (!wanted) return null;
  return (Array.isArray(records) ? records : []).find((record) => record.stayId === wanted) || null;
}

// Comprobación local previa (rápida y sin red). NO reemplaza la reserva del
// servidor: aunque aquí diga "permitido", el POS solo abre TUU con una
// reserva confirmada.
export function canStartTuuPayment(records, stayId) {
  const existing = findTuuPendingPayment(records, stayId);
  return existing ? { allowed: false, record: existing } : { allowed: true, record: null };
}

function upsert(storage, record) {
  const clean = sanitizeTuuPendingPayment(record);
  if (!clean) return { ok: false, record: null, records: loadTuuPendingPayments(storage) };
  const records = [...loadTuuPendingPayments(storage).filter((item) => item.stayId !== clean.stayId), clean];
  const ok = writeJson(storage, TUU_PENDING_STORAGE_KEY, records);
  return { ok, record: ok ? clean : null, records: ok ? records : loadTuuPendingPayments(storage) };
}

// Se llama DESPUÉS de que el servidor reservó el intento y ANTES de abrir TUU.
export function saveTuuPaymentStarted(storage, attempt, { now = new Date() } = {}) {
  const existing = findTuuPendingPayment(loadTuuPendingPayments(storage), attempt?.stayId);
  if (existing) return { ok: false, record: existing, records: loadTuuPendingPayments(storage), reason: "ALREADY_PENDING" };
  return upsert(storage, { ...attempt, status: TUU_PENDING_STATUS.IN_PROGRESS, startedAt: now.toISOString(), sequenceNumber: null, approvedAt: null, registrationAttempts: 0 });
}

function update(storage, stayId, changes) {
  const current = findTuuPendingPayment(loadTuuPendingPayments(storage), stayId);
  if (!current) return { ok: false, record: null, records: loadTuuPendingPayments(storage) };
  return upsert(storage, { ...current, ...changes });
}

export function markTuuPaymentUncertain(storage, stayId, reason, detail = null) {
  const current = findTuuPendingPayment(loadTuuPendingPayments(storage), stayId);
  // Un pago ya aprobado nunca retrocede a incierto.
  if (current?.status === TUU_PENDING_STATUS.PENDING_REGISTRATION) return { ok: true, record: current, records: loadTuuPendingPayments(storage) };
  return update(storage, stayId, { status: TUU_PENDING_STATUS.UNCERTAIN, uncertainReason: reason || "UNKNOWN", uncertainDetail: detail });
}

// TUU aprobó: se guarda ANTES de avisar al servidor y de registrar el pago.
export function markTuuPaymentApproved(storage, stayId, { sequenceNumber, approvedAt = new Date() } = {}) {
  const current = findTuuPendingPayment(loadTuuPendingPayments(storage), stayId);
  if (!current) return { ok: false, record: null, records: loadTuuPendingPayments(storage) };
  // La misma referencia recibida dos veces no altera el pago ya guardado.
  if (current.status === TUU_PENDING_STATUS.PENDING_REGISTRATION) return { ok: true, record: current, records: loadTuuPendingPayments(storage), duplicate: true };
  return update(storage, stayId, {
    status: TUU_PENDING_STATUS.PENDING_REGISTRATION,
    sequenceNumber: isValidTuuSequenceNumber(sequenceNumber) ? sequenceNumber : null,
    approvedAt: isoOrNull(approvedAt) || new Date().toISOString(),
    uncertainReason: null,
    uncertainDetail: null,
  });
}

export function noteTuuRegistrationFailure(storage, stayId, message) {
  const current = findTuuPendingPayment(loadTuuPendingPayments(storage), stayId);
  if (!current) return { ok: false, record: null, records: loadTuuPendingPayments(storage) };
  return update(storage, stayId, { registrationAttempts: current.registrationAttempts + 1, lastRegistrationError: message || "Error desconocido" });
}

// Quita la copia local. NO libera el ticket: eso solo lo hace el servidor
// cuando el intento queda resuelto.
export function clearTuuPendingPayment(storage, stayId) {
  const wanted = text(stayId, 64);
  const before = loadTuuPendingPayments(storage);
  const records = before.filter((record) => record.stayId !== wanted);
  if (records.length === before.length) return { ok: true, records: before };
  const ok = writeJson(storage, TUU_PENDING_STORAGE_KEY, records);
  return { ok, records: ok ? records : loadTuuPendingPayments(storage) };
}

// Al iniciar la app: un intento que quedó "en curso" no terminó de forma
// conocida (la app se cerró con TUU abierto) -> resultado incierto.
export function recoverTuuPendingPayments(storage) {
  const records = loadTuuPendingPayments(storage);
  let changed = false;
  const recovered = records.map((record) => {
    if (record.status !== TUU_PENDING_STATUS.IN_PROGRESS) return record;
    changed = true;
    return { ...record, status: TUU_PENDING_STATUS.UNCERTAIN, uncertainReason: "APP_RESTART" };
  });
  if (changed) writeJson(storage, TUU_PENDING_STORAGE_KEY, recovered);
  return changed ? loadTuuPendingPayments(storage) : records;
}

// Una respuesta de TUU que llega sin que nadie la esté esperando corresponde
// al intento sin resolver más reciente DE ESTE EQUIPO (TUU no identifica el
// ticket en su respuesta; la correlación exacta requiere cambios en la APK).
export function latestUnresolvedTuuPayment(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record.status === TUU_PENDING_STATUS.IN_PROGRESS || record.status === TUU_PENDING_STATUS.UNCERTAIN)
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))[0] || null;
}

// ---------------------------------------------------------------------------
// Solicitudes al servidor (nunca hacia TUU)
// ---------------------------------------------------------------------------

// Registro en ParkFacil de un pago que TUU YA aprobó: siempre por intento.
// `includeApprovedResult` (SOL-2026-10-11-001): el aviso de aprobación viaja en la
// misma llamada del registro, solo si este equipo tiene la aprobación de TUU.
export function buildTuuRegistrationRequest(record, { includeApprovedResult = false } = {}) {
  if (!record || record.status !== TUU_PENDING_STATUS.PENDING_REGISTRATION || !record.attemptId) return null;
  const withResult = includeApprovedResult && Boolean(record.deviceId);
  return {
    action: "EXIT",
    stayId: record.stayId,
    paymentMethod: "CARD",
    paymentCardType: record.cardType,
    cardPayment: {
      attemptId: record.attemptId,
      ...(withResult ? { result: { outcome: "APPROVED", deviceId: record.deviceId, reference: isValidTuuSequenceNumber(record.sequenceNumber) ? record.sequenceNumber : null } } : {}),
    },
  };
}

// Aviso al servidor del resultado entregado por TUU para un intento.
export function buildTuuResultReport(record, outcome, { reference = null, errorCode = null, errorMessage = null } = {}) {
  if (!record?.attemptId || !record?.deviceId) return null;
  if (!["APPROVED", "DECLINED", "CANCELLED", "NOT_STARTED", "UNCERTAIN"].includes(outcome)) return null;
  return {
    action: "CARD_PAYMENT_RESULT",
    attemptId: record.attemptId,
    deviceId: record.deviceId,
    outcome,
    reference: outcome === "APPROVED" && isValidTuuSequenceNumber(reference) ? reference : null,
    errorCode: outcome === "APPROVED" ? null : text(errorCode, 40),
    errorMessage: outcome === "APPROVED" ? null : text(errorMessage, 200),
  };
}

// Avisos de resultado que no alcanzaron a llegar al servidor: se reintentan.
// Mientras no lleguen, el servidor mantiene el ticket bloqueado (lado seguro).
export function loadQueuedTuuResultReports(storage) {
  const parsed = readJson(storage, TUU_REPORTS_STORAGE_KEY, []);
  return (Array.isArray(parsed) ? parsed : []).filter((item) => item && item.action === "CARD_PAYMENT_RESULT" && UUID.test(String(item.attemptId || "")));
}

export function queueTuuResultReport(storage, report) {
  if (!report?.attemptId) return false;
  const queue = loadQueuedTuuResultReports(storage).filter((item) => item.attemptId !== report.attemptId);
  // Un aprobado nunca se reemplaza por otro resultado del mismo intento.
  const previous = loadQueuedTuuResultReports(storage).find((item) => item.attemptId === report.attemptId);
  const next = previous?.outcome === "APPROVED" && report.outcome !== "APPROVED" ? previous : report;
  return writeJson(storage, TUU_REPORTS_STORAGE_KEY, [...queue, next].slice(-50));
}

export function removeQueuedTuuResultReport(storage, attemptId) {
  return writeJson(storage, TUU_REPORTS_STORAGE_KEY, loadQueuedTuuResultReports(storage).filter((item) => item.attemptId !== attemptId));
}

// ---------------------------------------------------------------------------
// Servidor como fuente de verdad
// ---------------------------------------------------------------------------

// Intento del servidor (vista POS) -> forma que muestra la tarjeta de pago
// pendiente. Sirve para consultar desde otro equipo; nunca relanza un cobro.
export function pendingViewFromServerAttempt(attempt, { deviceId = null } = {}) {
  if (!attempt?.id || !attempt?.stayId) return null;
  const status = attempt.status === "APPROVED_PENDING_REGISTRATION" ? TUU_PENDING_STATUS.PENDING_REGISTRATION
    : attempt.status === "UNCERTAIN" ? TUU_PENDING_STATUS.UNCERTAIN
      : ["RESERVED", "SENT_TO_TUU"].includes(attempt.status) ? TUU_PENDING_STATUS.IN_PROGRESS
        : null;
  if (!status) return null;
  return {
    source: "SERVER",
    serverStatus: attempt.status,
    // `deviceId` puede ser uno o varios: tras actualizar la APK este equipo
    // conoce su identificador nuevo (APK) y el anterior (WebView).
    otherDevice: [].concat(deviceId || []).filter(Boolean).length > 0 && ![].concat(deviceId || []).includes(attempt.deviceId),
    stayId: attempt.stayId,
    attemptId: attempt.id,
    deviceId: attempt.deviceId || null,
    status,
    cardType: attempt.cardType,
    amount: Math.round(Number(attempt.amount || 0)),
    ticketCode: attempt.ticketCode || null,
    plate: attempt.plate || null,
    parkingId: attempt.parkingId || null,
    parkingName: null,
    operatorName: attempt.operatorName || null,
    sequenceNumber: attempt.reference || null,
    startedAt: attempt.sentAt || attempt.reservedAt || null,
    approvedAt: attempt.approvedAt || null,
    uncertainReason: attempt.errorCode || null,
    uncertainDetail: attempt.errorMessage || null,
    regularized: Boolean(attempt.regularized),
    registrationAttempts: 0,
    lastRegistrationError: null,
  };
}

// Ajusta la copia local con los intentos ACTIVOS que informa el servidor
// (lista completa del estacionamiento, obtenida con éxito):
//  - un registro local cuyo intento ya no está activo en el servidor quedó
//    resuelto allá (pagado, sin cobro, liberado por regularización) -> se quita;
//  - incierto local + aprobado en el servidor (respuesta tardía ya informada o
//    regularización) -> pasa a pendiente de registro;
//  - en curso local + incierto en el servidor -> incierto.
// Un aprobado local nunca se degrada: el aviso al servidor puede estar en cola.
export function reconcileTuuPendingWithServer(storage, serverAttempts) {
  const active = new Map((Array.isArray(serverAttempts) ? serverAttempts : []).map((attempt) => [attempt.id, attempt]));
  const queued = new Set(loadQueuedTuuResultReports(storage).map((report) => report.attemptId));
  const records = loadTuuPendingPayments(storage);
  const next = [];
  let changed = false;
  for (const record of records) {
    const server = active.get(record.attemptId);
    if (!server) {
      // Con un aviso todavía en cola no se puede concluir nada: se conserva.
      if (queued.has(record.attemptId) || record.status === TUU_PENDING_STATUS.PENDING_REGISTRATION) { next.push(record); continue; }
      changed = true;
      continue;
    }
    if (record.status !== TUU_PENDING_STATUS.PENDING_REGISTRATION && server.status === "APPROVED_PENDING_REGISTRATION") {
      changed = true;
      next.push({ ...record, status: TUU_PENDING_STATUS.PENDING_REGISTRATION, sequenceNumber: isValidTuuSequenceNumber(server.reference) ? server.reference : record.sequenceNumber, approvedAt: isoOrNull(server.approvedAt) || record.approvedAt || new Date().toISOString(), uncertainReason: null, uncertainDetail: null });
      continue;
    }
    if (record.status === TUU_PENDING_STATUS.IN_PROGRESS && server.status === "UNCERTAIN") {
      changed = true;
      next.push({ ...record, status: TUU_PENDING_STATUS.UNCERTAIN, uncertainReason: server.errorCode || "SERVER_UNCERTAIN" });
      continue;
    }
    next.push(record);
  }
  if (changed) writeJson(storage, TUU_PENDING_STORAGE_KEY, next);
  return loadTuuPendingPayments(storage);
}

// Lista para mostrar: registros de este equipo + intentos activos del
// servidor que este equipo no tiene (iniciados en otro equipo).
export function mergeTuuPendingViews(localRecords, serverAttempts, { deviceId = null } = {}) {
  const local = Array.isArray(localRecords) ? localRecords : [];
  const byAttempt = new Set(local.map((record) => record.attemptId));
  const byStay = new Set(local.map((record) => record.stayId));
  const views = local.map((record) => ({ ...record, source: "LOCAL", otherDevice: false }));
  for (const attempt of Array.isArray(serverAttempts) ? serverAttempts : []) {
    if (byAttempt.has(attempt.id) || byStay.has(attempt.stayId)) continue;
    const view = pendingViewFromServerAttempt(attempt, { deviceId });
    if (view) views.push(view);
  }
  return views;
}

// ---------------------------------------------------------------------------
// Respuesta aprobada duplicada: últimas referencias ya procesadas en el equipo.
// ---------------------------------------------------------------------------

const TUU_PROCESSED_LIMIT = 50;

function loadProcessedTuuSequences(storage) {
  const parsed = readJson(storage, TUU_PROCESSED_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed.filter(isValidTuuSequenceNumber) : [];
}

export function isProcessedTuuSequence(storage, sequenceNumber) {
  if (!isValidTuuSequenceNumber(sequenceNumber)) return false;
  return loadProcessedTuuSequences(storage).includes(sequenceNumber);
}

export function rememberProcessedTuuSequence(storage, sequenceNumber) {
  if (!isValidTuuSequenceNumber(sequenceNumber)) return false;
  const next = [...loadProcessedTuuSequences(storage).filter((item) => item !== sequenceNumber), sequenceNumber].slice(-TUU_PROCESSED_LIMIT);
  return writeJson(storage, TUU_PROCESSED_STORAGE_KEY, next);
}

// ACTUALIZAR ESTADO (QA PRO2 2026-10-19, SOL-2026-10-11-001): siempre informa el resultado
// de la consulta; antes, si nada cambiaba, no mostraba nada y parecía no funcionar.
const ACTIVE_ATTEMPT_STATUSES = new Set(["RESERVED", "SENT_TO_TUU", "APPROVED_PENDING_REGISTRATION", "UNCERTAIN"]);

export function tuuRefreshResultMessage(attempts, stayId) {
  if (!Array.isArray(attempts)) return "No fue posible consultar el estado del pago. Verifica la conexión.";
  const stillPending = Boolean(stayId) && attempts.some((attempt) => attempt?.stayId === stayId && (!attempt?.status || ACTIVE_ATTEMPT_STATUSES.has(attempt.status)));
  return stillPending
    ? "Sin cambios: el pago sigue por resolver. Un administrador debe regularizarlo en Pagos con tarjeta."
    : "El pago ya fue resuelto.";
}
