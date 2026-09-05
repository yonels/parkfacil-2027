// Servicio de datos reales para /reportes-off-street (Fase 4). Reutiliza
// deliberadamente Fase 1 (toOperationRow/movementDateField, mapeo puro de
// "qué es un ingreso/salida/ticket abierto"; getOperationsSummary para el
// resumen) y Fase 2 (fetchAllMatchingRows/offStreetParkings/
// resolveQueryParkingIds, ya con paginación real sin techo silencioso).
// Recaudación y Cierres (reportes 1 y 4) NO tienen función propia aquí: el
// frontend reutiliza /api/recaudacion y /api/recaudacion/cierres
// directamente (Fase 2), cero backend nuevo para esos dos.
import { addDaysToIsoDate, filterRowsByExactOperationalDateRange, normalizePagination } from "./pos/activityReportCore.mjs";
import { fetchAllMatchingRows, offStreetParkings, resolveQueryParkingIds } from "./offStreetRevenueService.js";
import { getOperationsSummary } from "./posStaysService.js";
import { movementDateField, operationalTodayIso, toOperationRow } from "./offStreetOperationsCore.mjs";
import { elapsedMinutesSince, toShiftReportRow } from "./offStreetReportsCore.mjs";

const stayFields = "id,code,license_plate,parking_id,status,entry_at,entry_operator_id,entry_operator_name,entry_source,exit_at,exit_operator_id,exit_operator_name,elapsed_minutes,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,entry_shift_id,payment_shift_id";
const shiftFields = "id,operator_id,parking_id,shift_date,opened_at,closed_at,status";

function buildParkingMaps(parkings) {
  return {
    nameById: new Map(parkings.map((p) => [p.id, p.name])),
    companyNameById: new Map(parkings.map((p) => [p.id, p.companyName || ""])),
  };
}

// Reportes 2 y 3 (Entradas y salidas / Vehículos estacionados): misma tabla
// real (parking_stays), mismo mapeo (toOperationRow, Fase 1) -- la única
// diferencia entre ambos reportes es el filtro `status` que aplica el
// llamador (route). Nunca redefine qué es un ingreso/salida/ticket abierto;
// nunca usa searchOperationStays (Fase 1) porque esa función SÍ tiene el
// techo de 1000 filas ya corregido en Fase 2 para /recaudacion pero no
// tocado en /operacion (fuera de alcance modificarla) -- aquí se reutiliza
// el mismo mecanismo de fetch-todo-por-chunks de Fase 2 en su lugar.
export async function searchMovementsReport(db, scopedParkings, options = {}) {
  const { status = null, movement = null, dateFrom = null, dateTo = null, operatorId = null, query = null, parkingId = null, companyId = null, page, pageSize, all = false } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });

  const parkings = offStreetParkings(scopedParkings);
  const { nameById, companyNameById } = buildParkingMaps(parkings);
  const { candidateParkings, queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });
  const parkingOptions = candidateParkings.map((p) => ({ id: p.id, code: p.code, name: p.name, companyId: p.companyId, companyName: p.companyName }));

  if (!queryParkingIds.length) {
    return { rows: [], total: 0, page: safePage, pageSize: safeSize, parkings: parkingOptions };
  }

  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  const dateField = movementDateField(movement);
  const hasExplicitBound = Boolean(dateFrom || dateTo || status || operatorId || trimmedQuery);
  const today = operationalTodayIso(options.now instanceof Date ? options.now : new Date());
  const effectiveDateFrom = dateFrom || (all || hasExplicitBound ? null : addDaysToIsoDate(today, -7));
  const effectiveDateTo = dateTo || (all || hasExplicitBound ? null : today);

  const queryFactory = () => {
    let q = db.from("parking_stays").select(stayFields).in("parking_id", queryParkingIds);
    if (status) q = q.eq("status", status);
    if (operatorId) q = q.or(`entry_operator_id.eq.${operatorId},exit_operator_id.eq.${operatorId}`);
    if (trimmedQuery) q = q.or(`license_plate.ilike.%${trimmedQuery}%,code.ilike.%${trimmedQuery}%`);
    if (effectiveDateFrom) q = q.gte(dateField, `${addDaysToIsoDate(effectiveDateFrom, -1)}T00:00:00.000Z`);
    if (effectiveDateTo) q = q.lte(dateField, `${addDaysToIsoDate(effectiveDateTo, 1)}T23:59:59.999Z`);
    return q.order(dateField, { ascending: false });
  };
  const widened = await fetchAllMatchingRows(queryFactory);
  const exactRows = filterRowsByExactOperationalDateRange(widened, dateField, effectiveDateFrom, effectiveDateTo);
  const pageRows = all ? exactRows : exactRows.slice(offset, offset + safeSize);

  const rows = pageRows.map((stay) => ({
    ...toOperationRow(stay, {
      parkingName: nameById.get(stay.parking_id) || "",
      companyName: companyNameById.get(stay.parking_id) || "",
    }),
    elapsedMinutes: elapsedMinutesSince(stay.entry_at, options.now),
  }));

  return { rows, total: exactRows.length, page: safePage, pageSize: all ? rows.length : safeSize, parkings: parkingOptions };
}

// Reutiliza getOperationsSummary (Fase 1) TAL CUAL para el resumen de
// Entradas y salidas -- garantiza paridad por construcción (es literalmente
// la misma función, no una reimplementación).
export async function getMovementsSummary(db, scopedParkings, options = {}) {
  const parkings = offStreetParkings(scopedParkings);
  const { candidateParkings } = resolveQueryParkingIds(parkings, { parkingId: options.parkingId, companyId: options.companyId });
  return getOperationsSummary(db, candidateParkings, { now: options.now });
}

// Reporte 5 (Operadores y turnos): operator_shifts real, acotado a
// estacionamientos Off Street del scope. cantidad de operaciones/
// recaudación del turno se resuelven por LOTE usando los FK reales
// (entry_shift_id/payment_shift_id de parking_stays) -- nunca una
// heurística por fecha+operador, y nunca una consulta por turno (evita
// N+1: una sola consulta de parking_stays por lote, filtrada por los
// shiftIds de la página actual).
export async function searchShiftsReport(db, scopedParkings, options = {}) {
  const { status = null, operatorId = null, dateFrom = null, dateTo = null, parkingId = null, companyId = null, page, pageSize, all = false } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });

  const parkings = offStreetParkings(scopedParkings);
  const { nameById, companyNameById } = buildParkingMaps(parkings);
  const { queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });

  if (!queryParkingIds.length) {
    return { rows: [], total: 0, page: safePage, pageSize: safeSize };
  }

  const today = operationalTodayIso(options.now instanceof Date ? options.now : new Date());
  const hasExplicitBound = Boolean(dateFrom || dateTo || status || operatorId);
  const effectiveDateFrom = dateFrom || (all || hasExplicitBound ? null : addDaysToIsoDate(today, -30));
  const effectiveDateTo = dateTo || (all || hasExplicitBound ? null : today);

  const queryFactory = () => {
    let q = db.from("operator_shifts").select(shiftFields).in("parking_id", queryParkingIds);
    if (status) q = q.eq("status", status);
    if (operatorId) q = q.eq("operator_id", operatorId);
    if (effectiveDateFrom) q = q.gte("shift_date", effectiveDateFrom);
    if (effectiveDateTo) q = q.lte("shift_date", effectiveDateTo);
    return q.order("shift_date", { ascending: false });
  };
  const allShifts = await fetchAllMatchingRows(queryFactory);
  const pageShifts = all ? allShifts : allShifts.slice(offset, offset + safeSize);

  const operatorIds = [...new Set(pageShifts.map((s) => s.operator_id).filter(Boolean))];
  let operatorNameById = new Map();
  if (operatorIds.length) {
    const { data: members, error } = await db.from("company_members").select("user_id,full_name").in("user_id", operatorIds);
    if (error) throw error;
    operatorNameById = new Map((members || []).map((m) => [m.user_id, m.full_name]));
  }

  const shiftIds = pageShifts.map((s) => s.id);
  let entryCountByShift = new Map();
  let revenueByShift = new Map();
  if (shiftIds.length) {
    const [entryResult, paymentResult] = await Promise.all([
      db.from("parking_stays").select("entry_shift_id").in("entry_shift_id", shiftIds),
      db.from("parking_stays").select("payment_shift_id,total_amount").in("payment_shift_id", shiftIds).eq("status", "PAID"),
    ]);
    if (entryResult.error) throw entryResult.error;
    if (paymentResult.error) throw paymentResult.error;
    for (const row of entryResult.data || []) entryCountByShift.set(row.entry_shift_id, (entryCountByShift.get(row.entry_shift_id) || 0) + 1);
    for (const row of paymentResult.data || []) revenueByShift.set(row.payment_shift_id, (revenueByShift.get(row.payment_shift_id) || 0) + (Number(row.total_amount) || 0));
  }

  const rows = pageShifts.map((shift) => toShiftReportRow(shift, {
    parkingName: nameById.get(shift.parking_id) || "",
    companyName: companyNameById.get(shift.parking_id) || "",
    operatorName: operatorNameById.get(shift.operator_id) || "",
    entryCount: entryCountByShift.get(shift.id) || 0,
    revenueAmount: revenueByShift.get(shift.id) || 0,
  }));

  return { rows, total: allShifts.length, page: safePage, pageSize: all ? rows.length : safeSize };
}

// Reporte 6 (Ocupación): conteo real de "vehículos dentro" agrupado POR
// parking en UNA sola consulta (nunca una consulta por estacionamiento --
// evita N+1). La capacidad (getDashboardCapacityByParking, Fase 3) se
// resuelve aparte, en la ruta, porque importa "server-only" -- ver
// offStreetDashboardCapacity.js.
export async function getOpenCountsByParking(db, parkingIds) {
  if (!parkingIds.length) return new Map();
  const { data, error } = await db.from("parking_stays").select("parking_id").in("parking_id", parkingIds).eq("status", "OPEN");
  if (error) throw error;
  const counts = new Map();
  for (const row of data || []) counts.set(row.parking_id, (counts.get(row.parking_id) || 0) + 1);
  return counts;
}
