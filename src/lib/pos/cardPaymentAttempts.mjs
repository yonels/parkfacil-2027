// SOL-2026-10-11-001 — Reserva central de intentos de pago con tarjeta (POS / TUU).
//
// El servidor reserva el intento ANTES de que el POS abra TUU: a lo sumo un
// intento activo por ticket, garantizado por la base de datos (funciones de la
// migración 20261011110000_pos_card_payment_attempts.sql: bloqueo de la fila
// del ticket + índice único parcial). Este módulo NO implementa esa garantía:
// valida entradas, llama a las funciones y traduce sus errores.
//
// Sin la migración no existe un modo alternativo: el pago con tarjeta queda
// deshabilitado (nunca se vuelve al bloqueo solo local).
//
// Tres identificadores distintos:
//   attemptId       identificador interno del intento (lo crea el servidor).
//   idempotencyKey  clave de idempotencia de ParkFacil (la genera el POS).
//   reference       sequenceNumber que informa TUU; no se asume único globalmente.

export const CARD_ATTEMPT_STATUS = Object.freeze({
  RESERVED: "RESERVED",
  SENT_TO_TUU: "SENT_TO_TUU",
  APPROVED_PENDING_REGISTRATION: "APPROVED_PENDING_REGISTRATION",
  PAID: "PAID",
  DECLINED: "DECLINED",
  CANCELLED: "CANCELLED",
  NOT_SENT: "NOT_SENT",
  UNCERTAIN: "UNCERTAIN",
  RELEASED_BY_REGULARIZATION: "RELEASED_BY_REGULARIZATION",
});

// Estados que bloquean cualquier otro cobro del ticket.
export const ACTIVE_CARD_ATTEMPT_STATUSES = Object.freeze([
  CARD_ATTEMPT_STATUS.RESERVED,
  CARD_ATTEMPT_STATUS.SENT_TO_TUU,
  CARD_ATTEMPT_STATUS.APPROVED_PENDING_REGISTRATION,
  CARD_ATTEMPT_STATUS.UNCERTAIN,
]);

// Estados que necesitan atención (consulta de pendientes e inciertos).
export const UNRESOLVED_CARD_ATTEMPT_STATUSES = Object.freeze([
  CARD_ATTEMPT_STATUS.SENT_TO_TUU,
  CARD_ATTEMPT_STATUS.APPROVED_PENDING_REGISTRATION,
  CARD_ATTEMPT_STATUS.UNCERTAIN,
]);

export const CARD_ATTEMPT_STATUS_LABELS = Object.freeze({
  RESERVED: "Reservado (TUU aún no se abre)",
  SENT_TO_TUU: "Enviado a TUU, sin resultado",
  APPROVED_PENDING_REGISTRATION: "Pago aprobado, pendiente de registro",
  PAID: "Pago registrado",
  DECLINED: "Pago rechazado (sin cobro)",
  CANCELLED: "Pago cancelado (sin cobro)",
  NOT_SENT: "No se abrió TUU (sin cobro)",
  UNCERTAIN: "Resultado incierto",
  RELEASED_BY_REGULARIZATION: "Liberado por regularización manual",
});

export const CARD_ATTEMPT_OUTCOMES = Object.freeze(["APPROVED", "DECLINED", "CANCELLED", "NOT_STARTED", "UNCERTAIN"]);
export const CARD_ATTEMPT_RESOLUTIONS = Object.freeze(["APPROVED", "NOT_CHARGED"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEQUENCE = /^\d{12}$/;

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function cleanToken(value, min, max) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length >= min && text.length <= max && /^[A-Za-z0-9._:-]+$/.test(text) ? text : null;
}

// Clave de idempotencia generada por el POS para UN intento.
export function sanitizeIdempotencyKey(value) {
  return cleanToken(value, 16, 80);
}

// Identificador del equipo (generado y guardado por el POS en el dispositivo).
export function sanitizeDeviceId(value) {
  return cleanToken(value, 8, 80);
}

// Ambiente TUU del despliegue. DEV salvo configuración expresa de producción:
// las referencias de DEV y PROD nunca se mezclan.
export function tuuEnvironmentFromEnv(env = {}) {
  return String(env.POS_TUU_ENVIRONMENT || "").trim().toUpperCase() === "PROD" ? "PROD" : "DEV";
}

// Ambiente TUU que DECLARA el equipo (APK 0.4.0+, getTuuEnvironment):
// "DEV", "PROD", null si no lo declara, o "INVALID" si envía otra cosa.
export function normalizeDeclaredTuuEnvironment(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  return text === "DEV" || text === "PROD" ? text : "INVALID";
}

// Compatibilidad de ambiente entre el equipo y el servidor, antes de reservar.
// Es una comprobación de COMPATIBILIDAD (evitar mezclar DEV y PROD por error de
// configuración), no una prueba de autenticidad: el ambiente lo declara el
// cliente y no autoriza nada por sí solo.
//   - Declarado y distinto al del servidor: se rechaza.
//   - Sin declarar (APK 0.3.13 o navegador): solo puede operar en DEV.
export function tuuEnvironmentCompatibilityProblem({ serverEnvironment, declaredEnvironment }) {
  const server = serverEnvironment === "PROD" ? "PROD" : "DEV";
  if (declaredEnvironment === "INVALID") {
    return { status: 400, code: "CARD_ATTEMPT_ENVIRONMENT_INVALID", error: "El ambiente de pago informado por el equipo no es válido. No se inició ningún cobro." };
  }
  if (!declaredEnvironment) {
    if (server === "DEV") return null;
    return { status: 409, code: "CARD_ATTEMPT_ENVIRONMENT_REQUIRED", error: "Este equipo no informa su ambiente de pago y no puede operar en este ambiente. No se inició ningún cobro." };
  }
  if (declaredEnvironment !== server) {
    return { status: 409, code: "CARD_ATTEMPT_ENVIRONMENT_MISMATCH", error: "El ambiente de pago del equipo no coincide con el de ParkFacil. No se inició ningún cobro." };
  }
  return null;
}

export function isActiveCardAttemptStatus(status) {
  return ACTIVE_CARD_ATTEMPT_STATUSES.includes(status);
}

// Un intento RESERVED vencido nunca llegó a abrir TUU (el POS solo abre TUU
// con SENT_TO_TUU confirmado): no bloquea. Cualquier otro estado activo
// bloquea sin vencimiento.
export function cardAttemptBlocksStay(attempt, now = new Date()) {
  if (!attempt || !isActiveCardAttemptStatus(attempt.status)) return false;
  if (attempt.status !== CARD_ATTEMPT_STATUS.RESERVED) return true;
  const expires = attempt.reservationExpiresAt ? new Date(attempt.reservationExpiresAt) : null;
  return !expires || Number.isNaN(expires.getTime()) || expires.getTime() > now.getTime();
}

// Regularización de un resultado incierto: solo administradores (empresa o
// Root), nunca el operador. Política pendiente de aprobación funcional.
export function canRegularizeCardPayments(role) {
  return role === "company_admin" || role === "platform_admin";
}

export function canReviewCardPayments(role) {
  return role === "company_admin" || role === "platform_admin";
}

// Fila de la base -> forma pública. El cálculo de cobro firmado
// (charge_snapshot) no se expone.
export function mapCardPaymentAttempt(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    statusLabel: CARD_ATTEMPT_STATUS_LABELS[row.status] || row.status,
    companyId: row.company_id,
    parkingId: row.parking_id,
    stayId: row.stay_id,
    ticketCode: row.ticket_code,
    plate: row.license_plate,
    operatorId: row.operator_id,
    operatorName: row.operator_name || "",
    shiftId: row.shift_id,
    deviceId: row.device_id,
    provider: row.provider,
    environment: row.environment,
    cardType: row.card_type,
    amount: Math.round(Number(row.amount || 0)),
    reference: row.provider_reference || null,
    errorCode: row.provider_error_code || null,
    errorMessage: row.provider_error_message || null,
    resolutionSource: row.resolution_source || null,
    reservedAt: row.reserved_at || null,
    reservationExpiresAt: row.reservation_expires_at || null,
    sentAt: row.sent_at || null,
    resultAt: row.result_at || null,
    approvedAt: row.approved_at || null,
    paidAt: row.paid_at || null,
    paymentCode: row.payment_code || null,
    regularization: row.regularized_at ? {
      by: row.regularized_by || null,
      byName: row.regularized_by_name || "",
      at: row.regularized_at,
      reason: row.regularization_reason || "",
      evidence: row.regularization_evidence || "",
      previousStatus: row.regularization_previous_status || null,
    } : null,
  };
}

// Vista reducida para otro equipo/operador del mismo estacionamiento: permite
// consultar el estado sin datos de regularización.
export function mapCardPaymentAttemptForPos(row) {
  const attempt = mapCardPaymentAttempt(row);
  if (!attempt) return null;
  const { regularization, companyId, ...rest } = attempt;
  return { ...rest, regularized: Boolean(regularization), reservedPaymentCode: reservedPaymentCodeFrom(row?.charge_snapshot) };
}

// Código de pago PAG reservado al reservar el intento (SOL-2026-10-11-001): el POS
// imprime el comprobante apenas TUU aprueba, con el mismo código con que después
// se registra el pago. Se guarda dentro del cálculo (sin migración); no forma parte
// de la firma.
const RESERVED_PAYMENT_CODE_PATTERN = /^PAG-\d{12}-[0-9A-F]{4}$/;
export function reservedPaymentCodeFrom(snapshot) {
  const value = String(snapshot?.reservedPaymentCode || "");
  return RESERVED_PAYMENT_CODE_PATTERN.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Errores de las funciones de la base -> respuesta HTTP.
// ---------------------------------------------------------------------------

const ATTEMPT_ERRORS = Object.freeze({
  CARD_ATTEMPT_ACTIVE: [409, "Este ticket ya tiene un pago con tarjeta en curso o por resolver. No se inició ningún cobro."],
  CARD_PAYMENT_ATTEMPT_ACTIVE: [409, "Este ticket tiene un pago con tarjeta en curso o por resolver. No se puede pagar ni cerrar por otra vía hasta resolverlo."],
  CARD_ATTEMPT_IDEMPOTENCY_CONFLICT: [409, "La solicitud de pago no coincide con el intento ya reservado. No se inició ningún cobro."],
  CARD_ATTEMPT_STAY_NOT_FOUND: [404, "No existe el ticket solicitado."],
  CARD_ATTEMPT_STAY_NOT_OPEN: [409, "El ticket ya no está abierto."],
  CARD_ATTEMPT_SCOPE_MISMATCH: [404, "No existe el ticket solicitado."],
  CARD_ATTEMPT_SHIFT_INVALID: [409, "Debes tener un turno abierto en este estacionamiento."],
  CARD_ATTEMPT_AMOUNT_INVALID: [409, "El monto a pagar no es válido."],
  CARD_ATTEMPT_AMOUNT_MISMATCH: [409, "El monto del pago no coincide con el monto reservado para este ticket."],
  CARD_ATTEMPT_NOT_FOUND: [404, "No existe el intento de pago solicitado."],
  CARD_ATTEMPT_FORBIDDEN: [403, "Este intento de pago pertenece a otro equipo u operador."],
  CARD_ATTEMPT_INVALID_STATE: [409, "El intento de pago no admite esa operación en su estado actual."],
  CARD_ATTEMPT_RESULT_CONFLICT: [409, "El intento de pago ya tiene un resultado distinto. Requiere revisión."],
  CARD_ATTEMPT_OUTCOME_INVALID: [400, "El resultado informado no es válido."],
  CARD_ATTEMPT_REFERENCE_INVALID: [400, "La referencia del pago con tarjeta no es válida."],
  CARD_ATTEMPT_REFERENCE_REUSED: [409, "Esa referencia TUU ya está asociada a otro pago de la empresa. Revisa el número de operación."],
  CARD_ATTEMPT_NOT_APPROVED: [409, "El pago todavía no está aprobado. No se registró."],
  CARD_ATTEMPT_INCONSISTENT: [409, "El intento de pago quedó en un estado inconsistente. Requiere revisión."],
  CARD_ATTEMPT_RESOLUTION_INVALID: [400, "La resolución indicada no es válida."],
  CARD_ATTEMPT_REASON_REQUIRED: [400, "Indica el motivo de la regularización (mínimo 10 caracteres)."],
});

// ---------------------------------------------------------------------------
// Registro del pago: el ticket solicitado debe ser el ticket del intento.
// ---------------------------------------------------------------------------

// Contrato de EXIT con tarjeta en el POS: `stayId` es obligatorio. Falta o no
// es un identificador válido -> 400, antes de leer nada.
export function cardRegistrationStayIdProblem(requestedStayId) {
  if (isUuid(requestedStayId)) return null;
  return { status: 400, code: "CARD_PAYMENT_STAY_REQUIRED", error: "Indica el ticket que se está pagando. No se registró ningún pago." };
}

// Un intento pertenece a un único ticket. Si la solicitud indica otro ticket
// se rechaza ANTES de cualquier modificación, también cuando el intento ya
// está registrado (un reintento no puede devolver éxito para otro ticket).
// La respuesta es la misma exista o no el ticket indicado y sea de la empresa
// que sea: no revela nada sobre ese ticket ni sobre el del intento.
export function cardRegistrationStayMismatch(requestedStayId, attempt) {
  const requested = String(requestedStayId || "").toLowerCase();
  const own = String(attempt?.stay_id || "").toLowerCase();
  if (requested && own && requested === own) return null;
  return { status: 409, code: "CARD_ATTEMPT_STAY_MISMATCH", error: "El intento de pago no corresponde a este ticket. No se registró ningún pago." };
}

export const CARD_ATTEMPTS_UNAVAILABLE = Object.freeze({
  status: 503,
  code: "CARD_PAYMENT_RESERVATION_UNAVAILABLE",
  error: "El pago con tarjeta no está habilitado en este ambiente. No se inició ningún cobro.",
});

// La migración no está aplicada: no existen la tabla o las funciones.
export function isCardAttemptsStorageMissing(error) {
  const code = String(error?.code || "");
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code)) {
    return /pos_card_payment|card_payment_attempt/.test(text) || code === "PGRST202" || code === "PGRST205";
  }
  if (["42703", "PGRST204"].includes(code)) return /card_payment_attempt_id/.test(text);
  return false;
}

export function cardAttemptErrorResponse(error) {
  if (isCardAttemptsStorageMissing(error)) return { ...CARD_ATTEMPTS_UNAVAILABLE };
  const message = String(error?.message || "");
  for (const [code, [status, text]] of Object.entries(ATTEMPT_ERRORS)) {
    if (message.includes(code)) return { status, code, error: text };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Datos del pago a registrar, tomados del cálculo de cobro firmado que quedó
// guardado en el intento (nunca se recalcula después de la aprobación).
// ---------------------------------------------------------------------------

export function paymentFromChargeSnapshot(snapshot, { paymentCode } = {}) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const payment = {
    elapsed_minutes: Number.isFinite(Number(snapshot.elapsedMinutes)) ? Math.round(Number(snapshot.elapsedMinutes)) : null,
    rate_id: snapshot.rateId || "",
    rate_name: snapshot.rateName || null,
    billing_mode: snapshot.billingMode || null,
    subtotal_amount: number(snapshot.subtotalAmount),
    discount_amount: number(snapshot.discountAmount),
    coupon_id: snapshot.couponId || "",
    coupon_code: snapshot.couponCode || "",
    net_amount: number(snapshot.netAmount),
    tax_amount: number(snapshot.taxAmount),
    total_amount: number(snapshot.totalAmount),
    payment_code: paymentCode || null,
  };
  // V2 o V3 (desglose firmado con claves ordenadas, SOL-2026-10-11-001).
  if (["POS_STAY_QUOTE_V2", "POS_STAY_QUOTE_V3"].includes(snapshot.version) && snapshot.chargeBreakdown) payment.charge_breakdown = snapshot.chargeBreakdown;
  return payment;
}

// ---------------------------------------------------------------------------
// Acceso a datos. `db` es el cliente Supabase del servidor (service_role).
// ---------------------------------------------------------------------------

const ATTEMPT_COLUMNS = "id,status,company_id,parking_id,stay_id,ticket_code,license_plate,operator_id,operator_name,shift_id,device_id,provider,environment,card_type,amount,provider_reference,provider_error_code,provider_error_message,resolution_source,reserved_at,reservation_expires_at,sent_at,result_at,approved_at,paid_at,payment_code,regularized_by,regularized_by_name,regularized_at,regularization_reason,regularization_evidence,regularization_previous_status";

function single(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function reserveCardPaymentAttempt(db, input) {
  const { data, error } = await db.rpc("reserve_pos_card_payment", {
    p_idempotency_key: input.idempotencyKey,
    p_company_id: input.companyId,
    p_parking_id: input.parkingId,
    p_stay_id: input.stayId,
    p_operator_id: input.operatorId,
    p_operator_name: input.operatorName || "",
    p_shift_id: input.shiftId,
    p_device_id: input.deviceId,
    p_environment: input.environment,
    p_card_type: input.cardType,
    p_amount: input.amount,
    p_charge_snapshot: input.chargeSnapshot,
    p_ttl_seconds: input.ttlSeconds ?? 180,
  });
  if (error) throw error;
  return single(data);
}

export async function markCardPaymentAttemptSent(db, { attemptId, companyId, operatorId, deviceId }) {
  const { data, error } = await db.rpc("mark_pos_card_payment_sent", {
    p_attempt_id: attemptId, p_company_id: companyId, p_operator_id: operatorId, p_device_id: deviceId,
  });
  if (error) throw error;
  return single(data);
}

export async function reportCardPaymentAttemptResult(db, { attemptId, companyId, deviceId, outcome, reference, errorCode, errorMessage }) {
  const { data, error } = await db.rpc("report_pos_card_payment_result", {
    p_attempt_id: attemptId,
    p_company_id: companyId,
    p_device_id: deviceId,
    p_outcome: outcome,
    p_reference: reference || null,
    p_error_code: errorCode || null,
    p_error_message: errorMessage || null,
  });
  if (error) throw error;
  return single(data);
}

export async function registerCardPaymentAttempt(db, { attemptId, companyId, operatorId, operatorName, shiftId, payment }) {
  const { data, error } = await db.rpc("register_pos_card_payment", {
    p_attempt_id: attemptId,
    p_company_id: companyId,
    p_operator_id: operatorId,
    p_operator_name: operatorName || "",
    p_shift_id: shiftId,
    p_payment: payment,
  });
  if (error) throw error;
  return single(data);
}

export async function regularizeCardPaymentAttempt(db, { attemptId, companyId, actorId, actorName, resolution, reference, reason, evidence }) {
  const { data, error } = await db.rpc("regularize_pos_card_payment", {
    p_attempt_id: attemptId,
    p_company_id: companyId,
    p_actor_id: actorId,
    p_actor_name: actorName || "",
    p_resolution: resolution,
    p_reference: reference || null,
    p_reason: reason || "",
    p_evidence: evidence || null,
  });
  if (error) throw error;
  return single(data);
}

// Intento con su cálculo de cobro firmado (solo para registrar el pago en el servidor).
export async function getCardPaymentAttemptRow(db, { attemptId, companyId }) {
  let query = db.from("pos_card_payment_attempts").select(`${ATTEMPT_COLUMNS},charge_snapshot`).eq("id", attemptId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

// Intento activo de un ticket (cualquier equipo). null si no hay.
export async function findActiveCardPaymentAttemptRow(db, { stayId, now = new Date() }) {
  const { data, error } = await db.from("pos_card_payment_attempts").select(ATTEMPT_COLUMNS)
    .eq("stay_id", stayId).in("status", ACTIVE_CARD_ATTEMPT_STATUSES).order("reserved_at", { ascending: false }).limit(1);
  if (error) throw error;
  const row = single(data);
  return row && cardAttemptBlocksStay(mapCardPaymentAttempt(row), now) ? row : null;
}

// Consulta con aislamiento por empresa/estacionamiento: `parkingIds` es SIEMPRE
// la lista ya acotada por el alcance del usuario; una lista vacía no devuelve nada.
export async function listCardPaymentAttemptRows(db, { parkingIds, statuses = null, from = null, to = null, plate = null, parkingId = null, limit = 200 } = {}) {
  const scoped = Array.isArray(parkingIds) ? parkingIds : [];
  if (!scoped.length) return [];
  if (parkingId && !scoped.includes(parkingId)) return [];
  let query = db.from("pos_card_payment_attempts").select(ATTEMPT_COLUMNS).in("parking_id", parkingId ? [parkingId] : scoped);
  if (Array.isArray(statuses) && statuses.length) query = query.in("status", statuses);
  if (from) query = query.gte("reserved_at", `${from}T00:00:00-04:00`);
  if (to) query = query.lte("reserved_at", `${to}T23:59:59-03:00`);
  if (plate) query = query.ilike("license_plate", `%${String(plate).replace(/[%_]/g, "").trim()}%`);
  const { data, error } = await query.order("reserved_at", { ascending: false }).limit(Math.max(1, Math.min(Number(limit) || 200, 500)));
  if (error) throw error;
  return data || [];
}

export function validateRegularizationInput(input) {
  const resolution = CARD_ATTEMPT_RESOLUTIONS.includes(input?.resolution) ? input.resolution : null;
  const reason = String(input?.reason || "").trim();
  const evidence = String(input?.evidence || "").trim().slice(0, 500);
  const reference = String(input?.reference || "").trim();
  if (!resolution) return { ok: false, code: "CARD_ATTEMPT_RESOLUTION_INVALID", error: "Indica si el pago fue aprobado o no se realizó." };
  if (reason.length < 10) return { ok: false, code: "CARD_ATTEMPT_REASON_REQUIRED", error: "Indica el motivo de la regularización (mínimo 10 caracteres)." };
  if (reference && !SEQUENCE.test(reference)) return { ok: false, code: "CARD_ATTEMPT_REFERENCE_INVALID", error: "El número de operación TUU debe tener 12 dígitos." };
  // Declarar un pago como aprobado exige evidencia (p. ej. foto del comprobante TUU).
  if (resolution === "APPROVED" && evidence.length < 5) return { ok: false, code: "CARD_ATTEMPT_EVIDENCE_REQUIRED", error: "Describe la evidencia del pago aprobado (comprobante TUU, reporte de ventas)." };
  return { ok: true, resolution, reason: reason.slice(0, 500), evidence, reference: reference || null };
}

// Registro de un pago con tarjeta aprobado (QA PRO2 2026-10-19, SOL-2026-10-11-001):
// el cálculo guardado al reservar debe corresponder al intento (ticket y monto).
export function storedChargeSnapshotProblem(snapshot, attempt) {
  const amount = Math.round(Number(snapshot?.totalAmount));
  if (!snapshot || snapshot.stayId !== attempt?.stay_id || !(amount > 0) || amount !== Math.round(Number(attempt?.amount))) {
    return { status: 409, code: "CARD_ATTEMPT_SNAPSHOT_MISMATCH", error: "El cálculo guardado no corresponde a este pago. No se registró." };
  }
  return null;
}
