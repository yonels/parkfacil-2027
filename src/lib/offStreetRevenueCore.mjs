// Lógica pura (sin acceso a base de datos) para /recaudacion -- reemplazo
// real de los arrays demo (transactions/closures/dailyRevenueBase/
// companyProfiles) del Off Street Fase 2. Mismo patrón que
// offStreetOperationsCore.mjs (Fase 1) y pos/activityReportCore.mjs: mapeo
// de esquema DB -> forma de UI, cálculo de resumen y validación de filtros,
// separado de offStreetRevenueService.js (que sí toca la base de datos).
import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "./dataEntry.mjs";
import { addDaysToIsoDate, normalizePagination, operationalDateToIso, REPORT_PAYMENT_METHODS } from "./pos/activityReportCore.mjs";
import { paymentMethodLabel } from "./offStreetOperationsCore.mjs";

// "Recaudación" = pagos confirmados reales. parking_stays.status='CANCELLED'
// nunca llegó a ser un pago (no hay hoy ningún mecanismo que anule un pago ya
// confirmado -- ver comentario en supabase/migrations/20260817120000_pos_shift_closures.sql
// y el cálculo real de v_cancelled en close_operator_shift, que para
// OFF_STREET queda siempre en 0 por construcción). Por eso las transacciones
// de esta pantalla son exclusivamente status='PAID' -- no existe un filtro
// de "estado" real y no fabricado dentro de ese universo.
export const REVENUE_PAYMENT_METHODS = REPORT_PAYMENT_METHODS;

export function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateRevenueFilters({ dateFrom, dateTo, paymentMethod } = {}) {
  if (dateFrom && !isValidIsoDate(dateFrom)) return { ok: false, message: "dateFrom debe tener formato AAAA-MM-DD." };
  if (dateTo && !isValidIsoDate(dateTo)) return { ok: false, message: "dateTo debe tener formato AAAA-MM-DD." };
  if (dateFrom && dateTo && dateFrom > dateTo) return { ok: false, message: "dateFrom no puede ser posterior a dateTo." };
  if (paymentMethod && !REVENUE_PAYMENT_METHODS.includes(paymentMethod)) {
    return { ok: false, message: `paymentMethod debe ser una de: ${REVENUE_PAYMENT_METHODS.join(", ")}.` };
  }
  return { ok: true, message: "" };
}

export function operationalTodayIso(now = new Date(), timeZone = OPERATIONAL_TIME_ZONE) {
  return operationalDateToIso(toOperationalDateTimeParts(now, timeZone)?.entryDate);
}

// Fila real de transacción (parking_stays PAID) -> forma de UI. `shiftLabel`
// llega ya resuelto por el llamador (batch por página, ver
// offStreetRevenueService.js) para no hacer una consulta por fila.
export function toRevenueTransactionRow(stay, { timeZone = OPERATIONAL_TIME_ZONE, parkingName = "", companyName = "", shiftLabel = "" } = {}) {
  const exitParts = toOperationalDateTimeParts(stay?.exit_at, timeZone);
  return {
    id: stay?.id || null,
    ticket: stay?.code || "-",
    plate: stay?.license_plate || "-",
    parkingId: stay?.parking_id || null,
    parkingName,
    companyName,
    date: exitParts?.entryDate || "-",
    time: exitParts?.entryTime || "-",
    operator: stay?.exit_operator_name || "-",
    shiftLabel,
    paymentMethod: stay?.payment_method || null,
    amount: Number(stay?.total_amount) || 0,
    paymentCode: stay?.payment_code || "-",
    status: stay?.status || null,
  };
}

// Resumen del período (§3): recibe filas PAID YA acotadas por scope+fecha
// (nunca calcula sobre el universo completo) -- mismo patrón que
// computeOperationsSummary (Fase 1).
export function summarizeRevenueRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let totalAmount = 0;
  let cashAmount = 0;
  let cardAmount = 0;
  for (const row of list) {
    const amount = Number(row?.total_amount) || 0;
    totalAmount += amount;
    const method = String(row?.payment_method || "").toUpperCase();
    if (method === "CASH") cashAmount += amount;
    else if (method === "CARD") cardAmount += amount;
  }
  const count = list.length;
  return {
    totalAmount,
    cashAmount,
    cardAmount,
    count,
    averageTicket: count > 0 ? Math.round(totalAmount / count) : 0,
  };
}

// Serie diaria real (§12) -- agrupa por día operacional (America/Santiago)
// las mismas filas PAID ya usadas para el resumen (una sola consulta sirve
// ambos, ver offStreetRevenueService.js). Devuelve TODOS los días del rango
// (incluidos los de recaudación 0), en orden ascendente.
export function buildDailyRevenueSeries(rows, dateFrom, dateTo, { timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  if (!dateFrom || !dateTo) return [];
  const byDay = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const iso = operationalDateToIso(toOperationalDateTimeParts(row?.exit_at, timeZone)?.entryDate);
    if (!iso) continue;
    byDay.set(iso, (byDay.get(iso) || 0) + (Number(row?.total_amount) || 0));
  }
  const series = [];
  let cursor = dateFrom;
  // Tope defensivo: nunca iterar un rango absurdamente largo (protege contra
  // un dateFrom/dateTo mal formado que igual pasara la validación de arriba).
  let guard = 0;
  while (cursor <= dateTo && guard < 400) {
    series.push({ date: cursor, amount: byDay.get(cursor) || 0 });
    cursor = addDaysToIsoDate(cursor, 1);
    guard += 1;
  }
  return series;
}

// Diferencias de caja del período (§3, condicional a fuente real): suma de
// shift_closures.cash_difference dentro del scope+rango -- fuente real
// (RPC close_operator_shift), nunca un segundo cálculo independiente.
export function summarizeCashDifferences(closures) {
  const list = Array.isArray(closures) ? closures : [];
  const withDifference = list.filter((row) => row?.cashDifference != null && row.cashDifference !== 0);
  return {
    totalDifference: list.reduce((sum, row) => sum + (Number(row?.cashDifference) || 0), 0),
    closuresWithDifference: withDifference.length,
  };
}

// Fila real de cierre (shift_closures) -> forma de UI (§5). Reproyecta la
// MISMA fila que ya calculó close_operator_shift (nunca recalcula montos) --
// agrega company_name/parking_name/operator_name (ya denormalizados en la
// fila) que mapOperatorClosure (posOperatorShiftService.js, usado por el
// propio POS) no expone porque su consumidor -- la vista de un único turno
// del operador -- no los necesita.
export function toRevenueClosureRow(row) {
  return {
    id: row?.id || null,
    shiftId: row?.shift_id || null,
    folio: row?.folio || null,
    parkingId: row?.parking_id || null,
    parkingName: row?.parking_name || "",
    companyName: row?.company_name || "",
    operator: row?.operator_name || row?.operator_id || "-",
    shiftDate: row?.shift_date || null,
    openedAt: row?.actual_start_at || null,
    closedAt: row?.actual_close_at || null,
    confirmedPaymentsCount: row?.paid_vehicles_count ?? null,
    cancelledPaymentsCount: row?.cancelled_vehicles_count ?? null,
    pendingVehiclesCount: row?.pending_vehicles_count ?? null,
    cashAmount: row?.cash_amount != null ? Number(row.cash_amount) : 0,
    cardAmount: row?.card_amount != null ? Number(row.card_amount) : 0,
    grossAmount: row?.collected_amount != null ? Number(row.collected_amount) : 0,
    declaredCashAmount: row?.declared_cash_amount != null ? Number(row.declared_cash_amount) : null,
    cashDifference: row?.cash_difference != null ? Number(row.cash_difference) : null,
    differenceObservation: row?.difference_observation || "",
    status: row?.closure_status || "CONFIRMED",
    confirmedBy: row?.confirmed_by || null,
    confirmedAt: row?.confirmed_at || null,
  };
}

export { addDaysToIsoDate, paymentMethodLabel };
