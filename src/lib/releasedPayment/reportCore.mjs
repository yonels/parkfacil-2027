// Off Street — Pago liberado, Etapa 3 (paso 3.1, SOL-2026-10-16-003):
// reportes del administrador del estacionamiento (y supervisión Root).
// Decisión del usuario (2026-10-18): los tres reportes, en pantalla y con
// descarga Excel (misma planilla que los reportes Off Street).
// - ESTADIAS: estadías con beneficio ingresadas en el rango: tiempo
//   cubierto, tiempo cobrado y excedente pagado.
// - ACUERDOS: autorizaciones cuya vigencia toca el rango, con lo acordado
//   con el beneficiario y su pago registrado (vigente o anulado).
// - HISTORIAL: cambios de contratación, cupos, tarifas, autorizaciones y
//   pagos registrados en el rango, con actor y motivo.
// Puro (sin red): lo usan la ruta, la pantalla y las pruebas.

import { describeAuthorization } from "./authorizationCore.mjs";
import { describeContract } from "./contractCore.mjs";
import { PAYMENT_METHODS, PAYMENT_STATUS_LABELS, authorizationPaymentStatus, currentPayment, describePayment } from "./paymentCore.mjs";
import { describeTerms, formatClp, quantityText, TARIFF_UNITS, VAT_TREATMENT_LABELS } from "./tariffCore.mjs";
import { REGULARIZATION_LABELS, summarizeStayValues } from "./regularizationCore.mjs";
import { addLocalDays, formatLocalDateTime, parseLocalDate, zonedLocalToUtc } from "./zonedTime.mjs";

export const REPORT_TYPES = Object.freeze({
  ESTADIAS: "estadias",
  ACUERDOS: "acuerdos",
  HISTORIAL: "historial",
});

export const REPORT_LABELS = Object.freeze({
  estadias: "Estadías liberadas",
  acuerdos: "Acuerdos y pagos de beneficiarios",
  historial: "Historial de cambios",
});

export const MAX_REPORT_DAYS = 366;
export const MAX_REPORT_ROWS = 5000;

export const REPORT_EVENT_LABELS = Object.freeze({
  CONTRACT_CREATED: "Contratación registrada",
  CONTRACT_VERSIONED: "Nueva versión de la contratación",
  SPOTS_CHANGED: "Cupos simultáneos modificados",
  ACTIVATED: "Módulo activado",
  DEACTIVATED: "Módulo desactivado",
  TARIFF_CREATED: "Tarifa creada",
  TARIFF_VERSIONED: "Tarifa modificada",
  TARIFF_RETIRED: "Tarifa retirada",
  CREATED: "Autorización creada",
  UPDATED: "Autorización modificada",
  REVOKED: "Autorización revocada",
  PAYMENT_REGISTERED: "Pago del beneficiario registrado",
  PAYMENT_VOIDED: "Pago del beneficiario anulado",
});

const STAY_STATUS_LABELS = Object.freeze({
  OPEN: "En el estacionamiento",
  PAID: "Salida registrada",
  CANCELLED: "Anulada",
  UNPAID: "Salida sin pago",
});

const STAY_METHOD_LABELS = Object.freeze({ CASH: "Efectivo", CARD: "Tarjeta" });

// Resumen legible de previous_values/new_values de un evento (pantalla e
// historial exportado).
export function tariffText(tariff) {
  const unit = TARIFF_UNITS[tariff.billingUnit];
  return `${unit?.label || tariff.billingUnit}: ${formatClp(tariff.unitPrice)} por ${unit?.singular || "unidad"} (${VAT_TREATMENT_LABELS[tariff.vatTreatment] || tariff.vatTreatment})${tariff.label ? ` · ${tariff.label}` : ""}`;
}

export function summarizeEventValues(values) {
  if (!values || typeof values !== "object" || !Object.keys(values).length) return "—";
  if ("enabled" in values) return values.enabled ? "Activo" : "Desactivado";
  if ("retired" in values && Object.keys(values).length <= 2) return `Tarifa ${TARIFF_UNITS[values.billing_unit]?.label?.toLowerCase() || ""} retirada`;
  if ("operational_spots" in values) return `${values.operational_spots ?? "sin configurar"} cupos`;
  if ("amount" in values && "method" in values) {
    const text = describePayment({ amount: Number(values.amount), method: values.method, paidAt: values.paid_at, reference: values.reference });
    return values.status === "VOIDED" ? `${text} · anulado: ${values.void_reason || ""}` : text;
  }
  if ("unit_price" in values && "billing_unit" in values && !("license_plate" in values)) {
    return `v${values.version} · ${tariffText({ billingUnit: values.billing_unit, unitPrice: Number(values.unit_price), vatTreatment: values.vat_treatment, label: values.label })}`;
  }
  if ("monthly_fee_uf" in values) {
    return describeContract({
      monthlyFeeUf: Number(values.monthly_fee_uf), termMonths: values.term_months,
      baseMonthlyFeeUf: values.base_monthly_fee_uf === null || values.base_monthly_fee_uf === undefined ? null : Number(values.base_monthly_fee_uf),
    }) + (values.contract_reference ? ` · referencia ${values.contract_reference}` : "");
  }
  if ("license_plate" in values) {
    const terms = values.tariff_id
      ? describeTerms({ billingUnit: values.billing_unit, quantity: values.quantity, unitPrice: Number(values.unit_price), totalAmount: Number(values.total_amount), netAmount: Number(values.net_amount), taxAmount: Number(values.tax_amount) })
      : "sin condiciones comerciales";
    return `${values.license_plate} · ${describeAuthorization({ kind: values.kind, validFrom: values.valid_from, validTo: values.valid_to, schedule: values.schedule })} · ${terms} · ${values.status === "REVOKED" ? "Revocada" : "Activa"}`;
  }
  return JSON.stringify(values);
}

// Rango de fechas locales (America/Santiago), ambos días incluidos.
export function parseReportRange(desde, hasta) {
  const from = parseLocalDate(desde);
  const to = parseLocalDate(hasta);
  if (!from || !to) return { error: "Indica el rango de fechas (desde y hasta)." };
  const fromMs = zonedLocalToUtc(from);
  const toMs = zonedLocalToUtc(addLocalDays(to, 1));
  if (toMs <= fromMs) return { error: "La fecha final debe ser igual o posterior a la inicial." };
  if (toMs - fromMs > (MAX_REPORT_DAYS + 1) * 86400000) return { error: `El rango máximo es de ${MAX_REPORT_DAYS} días.` };
  return { fromIso: new Date(fromMs).toISOString(), toIso: new Date(toMs).toISOString() };
}

const minutes = (seconds) => (seconds === null || seconds === undefined ? null : Math.floor(Number(seconds) / 60));

function actorText(event) {
  if (event.actor_role === "system") return "Sistema (migración)";
  const role = event.actor_role === "platform_admin" ? "Root" : "Administrador";
  return event.actor_email ? `${event.actor_email} (${role})` : role;
}

// regularizationsByStay: Map stayId -> regularizaciones (Etapa 3). Una
// estadía abierta cuyo beneficio se anuló ya no tiene autorización: se
// identifica por su regularización.
export function stayReportRow(stay, authorizationsById = new Map(), regularizationsByStay = new Map()) {
  const regularizations = regularizationsByStay.get(stay.id) || [];
  const authorizationId = stay.released_payment_authorization_id || regularizations[0]?.authorizationId || null;
  const authorization = authorizationsById.get(authorizationId) || null;
  const regularizedClose = String(stay.payment_code || "").startsWith("REG-");
  const total = Number(stay.total_amount) || 0;
  const closed = stay.status === "PAID";
  return {
    id: stay.id,
    code: stay.code || "",
    plate: stay.license_plate,
    beneficiary: authorization?.beneficiaryName || "",
    status: STAY_STATUS_LABELS[stay.status] || stay.status,
    entryAt: formatLocalDateTime(stay.entry_at),
    exitAt: formatLocalDateTime(stay.exit_at),
    coveredMinutes: minutes(stay.released_covered_seconds),
    chargedMinutes: minutes(stay.released_chargeable_seconds),
    amount: closed ? total : null,
    method: !closed ? "" : stay.payment_method ? STAY_METHOD_LABELS[stay.payment_method] || stay.payment_method : regularizedClose ? "Regularización (sin cobro)" : stay.released_payment_authorization_id ? "Liberado (sin cobro)" : "Sin cobro",
    paymentCode: stay.payment_code || "",
    entryOperator: stay.entry_operator_name || "",
    exitOperator: stay.exit_operator_name || "",
    regularization: regularizations.map((item) => REGULARIZATION_LABELS[item.action] || item.action).join("; "),
  };
}

export function agreementReportRow(authorization, payments = []) {
  const own = payments.filter((item) => item.authorizationId === authorization.id);
  const payment = currentPayment(own, authorization.id);
  const voided = own.filter((item) => item.status === "VOIDED");
  const terms = authorization.terms;
  return {
    id: authorization.id,
    plate: authorization.licensePlate,
    beneficiary: authorization.beneficiaryName || "",
    beneficiaryReference: authorization.beneficiaryReference || "",
    validity: describeAuthorization(authorization),
    validFrom: formatLocalDateTime(authorization.validFrom),
    validTo: formatLocalDateTime(authorization.validTo),
    tariff: terms ? TARIFF_UNITS[terms.billingUnit]?.label || terms.billingUnit : "Sin condiciones",
    quantity: terms ? quantityText(terms.quantity, terms.billingUnit) : "",
    agreedAmount: terms ? terms.totalAmount : null,
    paymentStatus: PAYMENT_STATUS_LABELS[authorizationPaymentStatus(authorization, own)],
    paidAmount: payment ? payment.amount : null,
    paymentMethod: payment ? PAYMENT_METHODS[payment.method] || payment.method : "",
    paidAt: payment ? formatLocalDateTime(payment.paidAt) : "",
    paymentReference: payment?.reference || "",
    registeredBy: payment?.createdByEmail || "",
    voidedPayments: voided.length,
    lastVoidReason: voided.length ? voided.sort((a, b) => String(b.voidedAt).localeCompare(String(a.voidedAt)))[0].voidReason : "",
    authorizationStatus: authorization.status === "ACTIVE" ? `Activa (v${authorization.version})` : `Revocada${authorization.revokedReason ? `: ${authorization.revokedReason}` : ""}`,
  };
}

// La vigencia [validFrom, validTo) se cruza con el rango [fromIso, toIso).
export function authorizationOverlapsRange(authorization, fromIso, toIso) {
  return String(authorization.validFrom) < toIso && String(authorization.validTo) > fromIso;
}

export function historyReportRow(event, platesByAuthorization = new Map()) {
  return {
    id: event.id,
    createdAt: formatLocalDateTime(event.created_at),
    sortKey: event.created_at,
    event: REPORT_EVENT_LABELS[event.event_type] || event.event_type,
    scope: event.authorization_id ? "Autorización" : "Módulo",
    plate: event.authorization_id ? platesByAuthorization.get(event.authorization_id) || "" : "",
    actor: actorText(event),
    before: summarizeEventValues(event.previous_values),
    after: summarizeEventValues(event.new_values),
    reason: event.reason || "",
  };
}

export function regularizationHistoryRow(regularization) {
  return {
    id: regularization.id,
    createdAt: formatLocalDateTime(regularization.createdAt),
    sortKey: regularization.createdAt,
    event: REGULARIZATION_LABELS[regularization.action] || regularization.action,
    scope: "Estadía",
    plate: regularization.licensePlate,
    actor: actorText({ actor_email: regularization.actorEmail, actor_role: regularization.actorRole }),
    before: summarizeStayValues(regularization.previousValues),
    after: summarizeStayValues(regularization.newValues),
    reason: regularization.reason,
  };
}

export function sortHistoryRows(rows) {
  return [...rows].sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
}
