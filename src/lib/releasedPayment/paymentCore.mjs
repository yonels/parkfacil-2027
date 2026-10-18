// Off Street — Pago liberado: pago del beneficiario (SOL-2026-10-16-003).
// Decisiones del usuario (2026-10-16):
// - Lo registra SOLO el administrador de la empresa (Root no registra).
// - Solo pagos RECIBIDOS: sin cobro en línea; se anota el medio, la fecha y
//   la referencia del pago que el estacionamiento ya recibió.
// - SIN pagos parciales: el monto es exactamente el total acordado en la
//   autorización. El beneficio exige la autorización pagada (el ingreso lo
//   comprobará en la Etapa 2).
// - Un pago vigente por autorización. No se borra: se anula con motivo.
// Puro (sin red): lo usan las rutas, la pantalla y las pruebas.

import { formatLocalDateTime, parseLocalDateTime, RELEASED_PAYMENT_TIME_ZONE } from "./zonedTime.mjs";

export const PAYMENT_METHODS = Object.freeze({
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro",
});

export const PAYMENT_METHOD_CODES = Object.freeze(Object.keys(PAYMENT_METHODS));

export const PAYMENT_STATUS = Object.freeze({
  PAID: "PAID",
  PENDING: "PENDING",
});

export const PAYMENT_STATUS_LABELS = Object.freeze({
  PAID: "Pagada",
  PENDING: "Pago pendiente",
});

// Margen para relojes desalineados entre navegador y servidor.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function paymentFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    parkingId: row.parking_id,
    companyId: row.company_id,
    authorizationId: row.authorization_id,
    authorizationVersion: row.authorization_version,
    licensePlate: row.license_plate,
    amount: Number(row.amount),
    currency: row.currency,
    method: row.method,
    paidAt: row.paid_at,
    reference: row.reference || "",
    notes: row.notes || "",
    status: row.status,
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at,
    voidedAt: row.voided_at ?? null,
    voidedByEmail: row.voided_by_email || "",
    voidReason: row.void_reason || "",
  };
}

// Pago vigente (no anulado) de una autorización, si existe.
export function currentPayment(payments, authorizationId) {
  return (payments || []).find((item) => item.authorizationId === authorizationId && item.status === "REGISTERED") || null;
}

// Estado de pago de una autorización: pagada solo con un pago vigente por el
// total acordado.
export function authorizationPaymentStatus(authorization, payments) {
  const payment = currentPayment(payments, authorization?.id);
  const total = authorization?.terms?.totalAmount;
  if (payment && Number(payment.amount) === Number(total)) return PAYMENT_STATUS.PAID;
  return PAYMENT_STATUS.PENDING;
}

export function validatePaymentInput(input, { authorization, now = Date.now(), timeZone = RELEASED_PAYMENT_TIME_ZONE } = {}) {
  const errors = [];
  const method = String(input?.method || "").trim().toUpperCase();
  if (!PAYMENT_METHODS[method]) errors.push("Selecciona el medio de pago: efectivo, transferencia, tarjeta u otro.");
  const paidAtMs = parseLocalDateTime(input?.paidAt, timeZone);
  if (paidAtMs === null || !Number.isFinite(paidAtMs)) errors.push("Indica la fecha y hora en que se recibió el pago.");
  else if (paidAtMs > new Date(now).getTime() + FUTURE_TOLERANCE_MS) errors.push("La fecha del pago no puede ser futura.");
  const reference = String(input?.reference || "").trim().slice(0, 120);
  const notes = String(input?.notes || "").trim().slice(0, 500);
  if (method === "OTHER" && reference.length < 1 && notes.length < 3) errors.push("Para \"Otro\" medio de pago indica la referencia o una nota.");
  const total = authorization?.terms?.totalAmount;
  if (authorization?.status !== "ACTIVE") errors.push("La autorización no está activa.");
  if (total === undefined || total === null) errors.push("La autorización no tiene un total acordado.");
  // Sin pagos parciales: el monto lo fija el total acordado. Si el formulario
  // envía un monto, debe coincidir.
  if (input?.amount !== undefined && input?.amount !== null && String(input.amount).trim() !== "" && Number(String(input.amount).replace(/\./g, "")) !== Number(total)) {
    errors.push("No se aceptan pagos parciales: el monto debe ser el total acordado de la autorización.");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      amount: Number(total),
      method,
      paidAt: new Date(paidAtMs).toISOString(),
      reference,
      notes,
    },
  };
}

export function describePayment(payment, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  if (!payment) return "";
  const amount = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(payment.amount);
  const reference = payment.reference ? ` · ref. ${payment.reference}` : "";
  return `${amount} · ${PAYMENT_METHODS[payment.method] || payment.method} · recibido ${formatLocalDateTime(payment.paidAt, timeZone)}${reference}`;
}
