// Lógica pura (sin acceso a base de datos) para el endpoint de reportes de
// actividad de /modelo-dashboard: validación de filtros, mapeo
// actividad -> status real de parking_stays, paginación y proyección de
// filas. Separado de posStaysService.js (que sí toca la base de datos) para
// poder probarlo sin infraestructura de Supabase, mismo patrón que
// pos/paymentsDayCore.mjs.
import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "../dataEntry.mjs";

export const REPORT_ACTIVITIES = Object.freeze(["ingresos", "salidas", "pendientes", "anulados"]);
export const REPORT_PAYMENT_METHODS = Object.freeze(["CASH", "CARD"]);

const STATUS_BY_ACTIVITY = { pendientes: "OPEN", salidas: "PAID", anulados: "CANCELLED" };

// "ingresos" no filtra por status: cualquier permanencia con entrada
// registrada cuenta como ingreso, esté abierta, pagada o anulada.
export function statusForActivity(activity) {
  return STATUS_BY_ACTIVITY[activity] || null;
}

// Campo de fecha real usado para acotar el rango, según la actividad:
// "salidas" ancla en exit_at (importa cuándo salió); el resto ancla en
// entry_at — es la única fecha real disponible para OPEN/CANCELLED
// (parking_stays no registra una columna de "fecha de anulación" separada).
export function dateFieldForActivity(activity) {
  return activity === "salidas" ? "exit_at" : "entry_at";
}

export function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateReportFilters({ activity, dateFrom, dateTo, paymentMethod } = {}) {
  if (activity && !REPORT_ACTIVITIES.includes(activity)) {
    return { ok: false, message: `activity debe ser una de: ${REPORT_ACTIVITIES.join(", ")}.` };
  }
  if (dateFrom && !isValidIsoDate(dateFrom)) return { ok: false, message: "dateFrom debe tener formato AAAA-MM-DD." };
  if (dateTo && !isValidIsoDate(dateTo)) return { ok: false, message: "dateTo debe tener formato AAAA-MM-DD." };
  if (dateFrom && dateTo && dateFrom > dateTo) return { ok: false, message: "dateFrom no puede ser posterior a dateTo." };
  if (paymentMethod && !REPORT_PAYMENT_METHODS.includes(paymentMethod)) {
    return { ok: false, message: `paymentMethod debe ser una de: ${REPORT_PAYMENT_METHODS.join(", ")}.` };
  }
  return { ok: true, message: "" };
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function normalizePagination({ page, pageSize } = {}) {
  const rawPage = Number(page);
  const rawSize = Number(pageSize);
  const safePage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const safeSize = Number.isInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page: safePage, pageSize: safeSize, offset: (safePage - 1) * safeSize };
}

// Traduce una fila cruda de parking_stays a lo que consume el frontend —
// único lugar que mapea esquema DB -> forma de UI, para no duplicarlo.
export function toActivityReportRow(stay, { timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  const entryParts = toOperationalDateTimeParts(stay?.entry_at, timeZone);
  const exitParts = stay?.exit_at ? toOperationalDateTimeParts(stay.exit_at, timeZone) : null;
  return {
    id: stay?.id || null,
    ticket: stay?.code || "-",
    plate: stay?.license_plate || "-",
    parkingId: stay?.parking_id || null,
    parkingName: stay?.parking_name || "",
    status: stay?.status || null,
    entryDate: entryParts?.entryDate || "-",
    entryTime: entryParts?.entryTime || "-",
    exitDate: exitParts?.entryDate || "",
    exitTime: exitParts?.entryTime || "",
    minutes: typeof stay?.elapsed_minutes === "number" ? stay.elapsed_minutes : null,
    operator: stay?.exit_operator_name || stay?.entry_operator_name || "-",
    rateName: stay?.rate_name || "",
    netAmount: Number(stay?.net_amount) || 0,
    taxAmount: Number(stay?.tax_amount) || 0,
    amount: Number(stay?.total_amount) || 0,
    paymentMethod: stay?.payment_method || null,
  };
}

export function summarizeReportRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return { count: list.length, totalAmount: list.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0) };
}

// "AAAA-MM-DD" + N días (N puede ser negativo). Usa UTC puro (sin huso
// horario) porque solo sirve para ensanchar el límite de la consulta a la
// base de datos, no para calcular el día operacional real — eso lo hace
// filterRowsByExactOperationalDateRange después, con el dato ya en memoria.
export function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "28-07-2026" (formato de toOperationalDateTimeParts) -> "2026-07-28".
export function operationalDateToIso(ddmmyyyy) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(ddmmyyyy || ""));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

// La consulta a la base de datos usa un margen de ±1 día en UTC (ver
// addDaysToIsoDate) para no perder filas por el desfase de huso horario de
// America/Santiago frente a UTC. Esta función recorta esa ventana ancha al
// rango operacional EXACTO pedido por el usuario — mismo enfoque que ya usa
// filterPaidStaysForOperationalDay (pos/paymentsDayCore.mjs) para "hoy",
// generalizado aquí a un rango de días arbitrario.
export function filterRowsByExactOperationalDateRange(stays, dateField, dateFrom, dateTo, { timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  const list = Array.isArray(stays) ? stays : [];
  if (!dateFrom && !dateTo) return list;
  return list.filter((stay) => {
    const value = stay?.[dateField];
    if (!value) return false;
    const iso = operationalDateToIso(toOperationalDateTimeParts(value, timeZone)?.entryDate);
    if (!iso) return false;
    if (dateFrom && iso < dateFrom) return false;
    if (dateTo && iso > dateTo) return false;
    return true;
  });
}
