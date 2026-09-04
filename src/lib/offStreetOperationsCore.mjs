// Lógica pura (sin acceso a base de datos) para /operacion y /operacion/[id]
// -- reemplazo real de src/data/operacion.mjs (demo). Mismo patrón que
// src/lib/pos/activityReportCore.mjs (probado con node --test sin
// infraestructura de Supabase): mapeo de esquema DB -> forma de UI, cálculo
// del resumen operativo y validación de filtros, todo separado de
// posStaysService.js (que sí toca la base de datos).
import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "./dataEntry.mjs";
import { addDaysToIsoDate, normalizePagination, operationalDateToIso } from "./pos/activityReportCore.mjs";

// Únicos estados reales de parking_stays (ver constraint en
// supabase/migrations/20260731130000_parking_stays_tickets.sql). Los estados
// demo (open/closed/pending_review/lost/exempt) no existen en la tabla real.
export const OPERATION_STATUSES = Object.freeze(["OPEN", "PAID", "CANCELLED"]);
export const OPERATION_ORIGINS = Object.freeze(["WEB", "POS", "MOBILE", "TABLET", "OTHER"]);
export const OPERATION_MOVEMENTS = Object.freeze(["entries", "exits", "open"]);
export const OPERATION_PAYMENT_METHODS = Object.freeze(["CASH", "CARD"]);

export function statusLabel(status) {
  const labels = { OPEN: "Abierto", PAID: "Pagado", CANCELLED: "Anulado" };
  return labels[status] || status || "—";
}

export function originLabel(source) {
  const labels = { WEB: "Web", POS: "POS", MOBILE: "Móvil", TABLET: "Tablet", OTHER: "Otro" };
  return labels[source] || source || "—";
}

// parking_stays.payment_method solo distingue CASH/CARD (igual que
// activityReportCore.mjs / modelo-dashboard) -- nunca se inventa una
// distinción débito/crédito que el backend no tiene.
export function paymentMethodLabel(method) {
  if (method === "CASH") return "Efectivo";
  if (method === "CARD") return "Tarjeta";
  return "—";
}

// Campo de fecha real usado para el filtro de movimiento del día
// (Ingresos/Salidas/Vehículos dentro): "exits" ancla en exit_at; el resto
// ancla en entry_at -- única fecha real disponible para estadías OPEN.
export function movementDateField(movement) {
  return movement === "exits" ? "exit_at" : "entry_at";
}

export function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateOperationFilters({ status, movement, dateFrom, dateTo, paymentMethod } = {}) {
  if (status && !OPERATION_STATUSES.includes(status)) {
    return { ok: false, message: `estado debe ser uno de: ${OPERATION_STATUSES.join(", ")}.` };
  }
  if (movement && !OPERATION_MOVEMENTS.includes(movement)) {
    return { ok: false, message: `movimiento debe ser uno de: ${OPERATION_MOVEMENTS.join(", ")}.` };
  }
  if (dateFrom && !isValidIsoDate(dateFrom)) return { ok: false, message: "dateFrom debe tener formato AAAA-MM-DD." };
  if (dateTo && !isValidIsoDate(dateTo)) return { ok: false, message: "dateTo debe tener formato AAAA-MM-DD." };
  if (dateFrom && dateTo && dateFrom > dateTo) return { ok: false, message: "dateFrom no puede ser posterior a dateTo." };
  if (paymentMethod && !OPERATION_PAYMENT_METHODS.includes(paymentMethod)) {
    return { ok: false, message: `paymentMethod debe ser una de: ${OPERATION_PAYMENT_METHODS.join(", ")}.` };
  }
  return { ok: true, message: "" };
}

// "hoy" en el día operacional real (America/Santiago), como "AAAA-MM-DD" --
// nunca una fecha fija: se deriva de `now` (inyectable en tests).
export function operationalTodayIso(now = new Date(), timeZone = OPERATIONAL_TIME_ZONE) {
  return operationalDateToIso(toOperationalDateTimeParts(now, timeZone)?.entryDate);
}

// Traduce una fila cruda de parking_stays (+ nombre de parking/empresa ya
// resueltos por el llamador, igual que toActivityReportRow) a lo que
// consume la UI de /operacion. `id` es el UUID interno de la fila -- se
// conserva solo para enlazar a /operacion/[id] (rowHref), nunca se muestra
// como identificador visible (eso es ticket/patente, ver §4 del alcance).
export function toOperationRow(stay, { timeZone = OPERATIONAL_TIME_ZONE, parkingName = "", parkingCode = "", companyName = "" } = {}) {
  const entryParts = toOperationalDateTimeParts(stay?.entry_at, timeZone);
  const exitParts = stay?.exit_at ? toOperationalDateTimeParts(stay.exit_at, timeZone) : null;
  return {
    id: stay?.id || null,
    ticket: stay?.code || "-",
    plate: stay?.license_plate || "-",
    parkingId: stay?.parking_id || null,
    parkingName,
    parkingCode,
    companyName,
    status: stay?.status || null,
    origin: stay?.entry_source || null,
    entryDate: entryParts?.entryDate || "-",
    entryTime: entryParts?.entryTime || "-",
    exitDate: exitParts?.entryDate || "",
    exitTime: exitParts?.entryTime || "",
    minutes: typeof stay?.elapsed_minutes === "number" ? stay.elapsed_minutes : null,
    entryOperator: stay?.entry_operator_name || "-",
    exitOperator: stay?.exit_operator_name || "",
    rateName: stay?.rate_name || "",
    amount: Number(stay?.total_amount) || 0,
    paymentMethod: stay?.payment_method || null,
  };
}

export function summarizeOperationRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return { count: list.length, totalAmount: list.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0) };
}

// Resumen superior de /operacion (Ingresos del día / Salidas del día /
// Vehículos dentro / Tickets abiertos). Recibe filas YA acotadas por scope
// de empresa/estacionamiento (nunca calcula sobre el universo completo).
//
// "Vehículos actualmente dentro" y "Tickets/estadías abiertas" son,
// literalmente, el mismo dato real en este modelo: parking_stays no tiene
// ninguna columna que distinga "vehículo físicamente dentro" de "ticket
// abierto" -- ambos son status='OPEN'. Se exponen como dos KPI separados
// porque el alcance funcional los pide como dos indicadores, pero comparten
// el mismo cálculo a propósito (no se inventa una distinción inexistente).
export function computeOperationsSummary({ openCount = 0, entriesToday = [], exitsToday = [] } = {}) {
  const vehiculosDentro = Number.isFinite(openCount) ? openCount : 0;
  return {
    ingresosDia: Array.isArray(entriesToday) ? entriesToday.length : 0,
    salidasDia: Array.isArray(exitsToday) ? exitsToday.length : 0,
    vehiculosDentro,
    ticketsAbiertos: vehiculosDentro,
  };
}

// Ficha /operacion/[id] (§8 del alcance): mapea la fila cruda + parking ya
// resuelto (con companyId/companyName, ver estacionamientosRepository.js) +
// turnos ya resueltos (o null si la estadía no tiene entry_shift_id/
// payment_shift_id) a la forma que consume la UI. Solo expone campos que
// realmente existen en la fila -- nunca se inventa un valor.
export function toOperationDetail(stay, { parking = null, entryShift = null, paymentShift = null, timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  const entryParts = toOperationalDateTimeParts(stay?.entry_at, timeZone);
  const exitParts = stay?.exit_at ? toOperationalDateTimeParts(stay.exit_at, timeZone) : null;

  return {
    id: stay?.id || null,
    ticket: stay?.code || "-",
    plate: stay?.license_plate || "-",
    qrToken: stay?.qr_token || null,
    status: stay?.status || null,
    origin: stay?.entry_source || null,
    company: parking ? { id: parking.companyId || null, name: parking.companyName || "" } : null,
    parking: parking ? { id: parking.id, name: parking.name, code: parking.code } : null,
    entry: {
      at: stay?.entry_at || null,
      date: entryParts?.entryDate || "-",
      time: entryParts?.entryTime || "-",
      operator: stay?.entry_operator_name || "-",
      shiftDate: entryShift?.shift_date || null,
    },
    exit: stay?.exit_at ? {
      at: stay.exit_at,
      date: exitParts?.entryDate || "-",
      time: exitParts?.entryTime || "-",
      operator: stay?.exit_operator_name || "-",
      shiftDate: paymentShift?.shift_date || null,
    } : null,
    billing: {
      minutes: typeof stay?.elapsed_minutes === "number" ? stay.elapsed_minutes : null,
      rateName: stay?.rate_name || "",
      billingMode: stay?.billing_mode || "",
      subtotalAmount: stay?.subtotal_amount != null ? Number(stay.subtotal_amount) : null,
      discountAmount: stay?.discount_amount != null ? Number(stay.discount_amount) : 0,
      netAmount: stay?.net_amount != null ? Number(stay.net_amount) : null,
      taxAmount: stay?.tax_amount != null ? Number(stay.tax_amount) : null,
      totalAmount: stay?.total_amount != null ? Number(stay.total_amount) : null,
      paymentMethod: stay?.payment_method || null,
      paymentCode: stay?.payment_code || null,
    },
    coupon: stay?.coupon_code ? { code: stay.coupon_code } : null,
  };
}

export { addDaysToIsoDate, normalizePagination, operationalDateToIso };
