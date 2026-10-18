// Off Street — Pago liberado, Etapa 3 (paso 3.2, SOL-2026-10-16-003):
// regularización de estadías liberadas por el administrador del
// estacionamiento. Decisión del usuario (2026-10-18): SIN TOCAR DINERO, con
// motivo obligatorio y auditoría.
// - CLOSE_OPEN: cerrar una estadía liberada que quedó abierta, con la hora de
//   salida que indica el administrador. Queda en $0, sin turno de pago (no
//   entra al cierre de caja) y libera el cupo.
// - VOID_BENEFIT: anular el beneficio mal aplicado. Si la estadía está abierta
//   pasa a ser normal (el POS la cobra a la salida desde su ingreso); si ya
//   salió, no cambia nada de la estadía y solo queda registrada la anulación.
// La RPC released_payment_regularize_stay vuelve a validar todo en la base.
// Puro (sin red): lo usan la ruta, la pantalla y las pruebas.

import { formatLocalDateTime, parseLocalDateTime, RELEASED_PAYMENT_TIME_ZONE } from "./zonedTime.mjs";

export const REGULARIZATION_ACTIONS = Object.freeze({
  CLOSE_OPEN: "CLOSE_OPEN",
  VOID_BENEFIT: "VOID_BENEFIT",
});

export const REGULARIZATION_LABELS = Object.freeze({
  CLOSE_OPEN: "Estadía cerrada por regularización",
  VOID_BENEFIT: "Beneficio anulado",
});

// Margen para relojes desalineados entre navegador y servidor (igual a la RPC).
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_REASON = 500;

export function validateRegularizationInput(input, { stay, now = Date.now(), timeZone = RELEASED_PAYMENT_TIME_ZONE } = {}) {
  const errors = [];
  const action = String(input?.action || "");
  const reason = String(input?.reason || "").trim();
  if (!Object.values(REGULARIZATION_ACTIONS).includes(action)) errors.push("Selecciona una acción válida.");
  if (reason.length < 3) errors.push("Indica el motivo (mínimo 3 caracteres).");
  let exitAtMs = null;
  if (action === REGULARIZATION_ACTIONS.CLOSE_OPEN) {
    exitAtMs = parseLocalDateTime(input?.exitAt, timeZone);
    const entryMs = stay?.entry_at || stay?.entryAt ? Date.parse(stay.entry_at || stay.entryAt) : null;
    if (exitAtMs === null) errors.push("Indica la fecha y hora de salida.");
    else if (entryMs !== null && exitAtMs < entryMs) errors.push("La salida no puede ser anterior al ingreso.");
    else if (exitAtMs > now + FUTURE_TOLERANCE_MS) errors.push("La salida no puede ser futura.");
  }
  if (errors.length) return { errors };
  return {
    value: {
      action,
      exitAt: exitAtMs === null ? null : new Date(exitAtMs).toISOString(),
      reason: reason.slice(0, MAX_REASON),
    },
  };
}

// Qué se puede hacer con una estadía liberada (botones de la pantalla).
export function regularizationOptions(stay, regularizations = []) {
  const own = regularizations.filter((item) => (item.stayId ?? item.stay_id) === stay.id);
  const voided = own.some((item) => item.action === REGULARIZATION_ACTIONS.VOID_BENEFIT);
  const released = Boolean(stay.released_payment_authorization_id ?? stay.releasedPaymentAuthorizationId);
  return {
    canClose: released && !voided && stay.status === "OPEN",
    canVoid: released && !voided && (stay.status === "OPEN" || stay.status === "PAID"),
  };
}

export function regularizationFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    stayId: row.stay_id,
    parkingId: row.parking_id,
    authorizationId: row.authorization_id,
    licensePlate: row.license_plate,
    action: row.action,
    stayStatusBefore: row.stay_status_before,
    exitAt: row.exit_at ?? null,
    previousValues: row.previous_values || {},
    newValues: row.new_values || {},
    reason: row.reason || "",
    actorEmail: row.actor_email || "",
    actorRole: row.actor_role || "",
    createdAt: row.created_at,
  };
}

// Resumen legible de la estadía antes/después (historial y reportes).
export function summarizeStayValues(values) {
  if (!values || typeof values !== "object" || !Object.keys(values).length) return "—";
  const status = { OPEN: "Abierta", PAID: "Cerrada", CANCELLED: "Anulada" }[values.status] || values.status || "";
  const parts = [status];
  if (values.exit_at) parts.push(`salida ${formatLocalDateTime(values.exit_at)}`);
  if (values.total_amount !== null && values.total_amount !== undefined) parts.push(`$${new Intl.NumberFormat("es-CL").format(Number(values.total_amount))}`);
  if (values.payment_code) parts.push(values.payment_code);
  parts.push(values.released_payment_authorization_id ? "con beneficio" : "sin beneficio");
  return parts.filter(Boolean).join(" · ");
}

export function describeRegularization(regularization) {
  const label = REGULARIZATION_LABELS[regularization.action] || regularization.action;
  const exit = regularization.exitAt ? ` · salida ${formatLocalDateTime(regularization.exitAt)}` : "";
  const scope = regularization.action === REGULARIZATION_ACTIONS.VOID_BENEFIT
    ? regularization.stayStatusBefore === "OPEN" ? " (estaba abierta: se cobra como estadía normal)" : " (ya había salido: sin cambios de dinero)"
    : "";
  return `${label}${scope}${exit}`;
}
