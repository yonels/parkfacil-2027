// Servicio de datos reales para /recaudacion (Off Street Fase 2). Toca
// parking_stays (transacciones PAID) y shift_closures (cierres de caja) --
// reutiliza exactamente las mismas fuentes que ya usa el POS
// (posOperatorShiftService.js / close_operator_shift) en vez de un segundo
// cálculo independiente. Mismo patrón de aislamiento que posStaysService.js
// (Fase 1): recibe `scopedParkings` YA resuelto por la ruta
// (listParkings(db, authorization.scope)), nunca vuelve a resolver el scope.
import {
  addDaysToIsoDate,
  filterRowsByExactOperationalDateRange,
  normalizePagination,
} from "./pos/activityReportCore.mjs";
import {
  buildDailyRevenueSeries,
  operationalTodayIso,
  summarizeCashDifferences,
  summarizeRevenueRows,
  toRevenueClosureRow,
  toRevenueTransactionRow,
} from "./offStreetRevenueCore.mjs";
import { AuthorizationError } from "./auth/contextCore.mjs";

const stayFields = "id,code,license_plate,parking_id,status,exit_at,exit_operator_id,exit_operator_name,payment_method,payment_code,total_amount,payment_shift_id";
const closureFields = "id,shift_id,folio,parking_id,parking_name,company_name,operator_id,operator_name,shift_date,actual_start_at,actual_close_at,paid_vehicles_count,cancelled_vehicles_count,pending_vehicles_count,cash_amount,card_amount,collected_amount,declared_cash_amount,cash_difference,difference_observation,closure_status,confirmed_by,confirmed_at";

// Auditoría previa (§11/§12): un .limit(1000)/.limit(20000) simple es un
// techo SILENCIOSO -- si el período filtrado supera ese tope, filas válidas
// desaparecen sin aviso (total mal calculado, KPIs subestimados, página 101
// inalcanzable). Se reemplaza por un fetch-todo encadenado con .range() real
// de PostgREST (paginación servidor real por tramo, nunca slice() sobre un
// array ya truncado) que nunca se detiene silenciosamente: si el conjunto
// filtrado excede MAX_MATCHING_ROWS, se rechaza explícitamente
// (RevenueRangeTooWideError) pidiendo acotar el rango, en vez de devolver un
// subconjunto arbitrario. El tradeoff documentado: no se usa .range() como
// paginación final de la página visible (el margen ±1 día en UTC para el
// recorte exacto de día operacional America/Santiago no se alinea 1:1 con un
// offset de base de datos), así que se trae el conjunto COMPLETO ya acotado
// por filtros+rango (nunca todo parking_stays) y se pagina en memoria
// después del recorte exacto -- el mismo patrón "chunks" que ya usa el resto
// del proyecto (searchActivityReport/searchOperationStays, Fase 1), solo que
// ahora sin techo silencioso.
const CHUNK_SIZE = 1000;
const MAX_MATCHING_ROWS = 20000;

export class RevenueRangeTooWideError extends Error {
  constructor() {
    super("REVENUE_RANGE_TOO_WIDE");
    this.name = "RevenueRangeTooWideError";
    this.code = "REVENUE_RANGE_TOO_WIDE";
  }
}

// `queryFactory` reconstruye el builder completo (todos los filtros + order)
// en cada vuelta -- .range() es la paginación real de PostgREST (LIMIT/
// OFFSET ejecutado en el servidor), no una ilusión en memoria.
export async function fetchAllMatchingRows(queryFactory) {
  const all = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await queryFactory().range(offset, offset + CHUNK_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < CHUNK_SIZE) break;
    offset += CHUNK_SIZE;
    if (all.length >= MAX_MATCHING_ROWS) throw new RevenueRangeTooWideError();
  }
  return all;
}

// Off Street es el único dominio que escribe en parking_stays (On Street usa
// parking_movements/parking_payments -- tablas distintas, ver Fase 1), así
// que las transacciones nunca requieren filtrar por tipo de parking a nivel
// de dato -- pero igual se filtra por type==='OFF_STREET' aquí, como defensa
// en profundidad server-side (nunca confiar en el invariante de "quién
// escribe dónde" como única barrera). shift_closures SÍ es compartida con
// On Street (turnos con sector_id/street_id) -- filtrar por parkings
// OFF_STREET evita que un cierre On Street se cuele en esta pantalla. Esta
// función es la ÚNICA fuente de estacionamientos candidatos para las tres
// consultas (transacciones/resumen/cierres): ninguna puede ver un parking
// ON_STREET aunque esté en el scope autorizado de la empresa.
export function offStreetParkings(scopedParkings) {
  return (Array.isArray(scopedParkings) ? scopedParkings : []).filter((parking) => parking.type === "OFF_STREET");
}

function uniqueCompaniesFromParkings(parkings) {
  const map = new Map();
  for (const parking of parkings) {
    if (parking.companyId && !map.has(parking.companyId)) {
      map.set(parking.companyId, { id: parking.companyId, name: parking.companyName || "Empresa asociada" });
    }
  }
  return [...map.values()];
}

export function resolveQueryParkingIds(parkings, { parkingId, companyId } = {}) {
  const candidateParkings = companyId ? parkings.filter((parking) => parking.companyId === companyId) : parkings;
  if (!parkingId) return { candidateParkings, queryParkingIds: candidateParkings.map((parking) => parking.id) };
  const normalized = String(parkingId).toUpperCase();
  const match = candidateParkings.find((parking) => parking.id.toUpperCase() === normalized || parking.code.toUpperCase() === normalized);
  if (!match) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el estacionamiento solicitado.", null);
  return { candidateParkings, queryParkingIds: [match.id] };
}

// Consulta base reutilizada por transacciones Y resumen (§5 de la auditoría:
// los KPIs deben reflejar los mismos filtros que la tabla). `query` (texto
// libre) es exclusivo de la tabla -- nunca se pasa aquí desde el resumen, a
// propósito (ver getRevenueOverview).
function buildPaidStaysQueryFactory(db, queryParkingIds, { paymentMethod, operatorId, query, dateFrom, dateTo }) {
  return () => {
    let q = db.from("parking_stays").select(stayFields).in("parking_id", queryParkingIds).eq("status", "PAID");
    if (paymentMethod) q = q.eq("payment_method", paymentMethod);
    if (operatorId) q = q.eq("exit_operator_id", operatorId);
    if (query) q = q.or(`license_plate.ilike.%${query}%,code.ilike.%${query}%,payment_code.ilike.%${query}%`);
    // Margen de ±1 día en UTC (mismo criterio que /operacion, Fase 1) para no
    // perder filas por el desfase de huso horario frente a America/Santiago;
    // el recorte exacto ocurre después con filterRowsByExactOperationalDateRange.
    if (dateFrom) q = q.gte("exit_at", `${addDaysToIsoDate(dateFrom, -1)}T00:00:00.000Z`);
    if (dateTo) q = q.lte("exit_at", `${addDaysToIsoDate(dateTo, 1)}T23:59:59.999Z`);
    return q.order("exit_at", { ascending: false });
  };
}

async function fetchExactPaidStays(db, queryParkingIds, filters) {
  const widened = await fetchAllMatchingRows(buildPaidStaysQueryFactory(db, queryParkingIds, filters));
  return filterRowsByExactOperationalDateRange(widened, "exit_at", filters.dateFrom, filters.dateTo);
}

// Consulta real de transacciones (§4): estadías PAID -- únicas filas que
// realmente representan un pago confirmado (status='PAID' ya garantiza, por
// constraint real de la tabla -- ver parking_stays_tickets.sql --
// exit_at/payment_code no nulos; no hace falta imponer una condición
// artificial adicional). Turno (§4/§8/§9) se resuelve por el
// payment_shift_id REAL de cada fila (nunca una heurística por fecha+
// operador), en lote y solo para las filas finalmente devueltas (nunca una
// consulta por fila).
//
// `options.all === true` (exportación CSV, §4 de la auditoría, Opción A):
// devuelve el conjunto COMPLETO que corresponde a los filtros (mismo scope,
// mismo tope no-silencioso MAX_MATCHING_ROWS), no solo la página visible.
export async function searchRevenueTransactions(db, scopedParkings, options = {}) {
  const { dateFrom = null, dateTo = null, paymentMethod = null, parkingId = null, companyId = null, operatorId = null, query = null, page, pageSize, all = false } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });

  const parkings = offStreetParkings(scopedParkings);
  const companies = uniqueCompaniesFromParkings(parkings);
  const nameById = new Map(parkings.map((parking) => [parking.id, parking.name]));
  const companyNameById = new Map(parkings.map((parking) => [parking.id, parking.companyName || ""]));

  const { candidateParkings, queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });
  const parkingOptions = candidateParkings.map((parking) => ({ id: parking.id, code: parking.code, name: parking.name, companyId: parking.companyId, companyName: parking.companyName }));

  if (!queryParkingIds.length) {
    return { rows: [], total: 0, page: safePage, pageSize: safeSize, parkings: parkingOptions, companies };
  }

  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  const today = operationalTodayIso();
  // Sin ningún filtro explícito (carga inicial): acota a los últimos 7 días
  // para no cargar la historia completa de pagos en memoria (§11), igual
  // que /operacion (Fase 1). Exportar "todo" (all=true) siempre exige un
  // rango explícito -- no tiene sentido exportar "los últimos 7 días
  // implícitos" con un botón que promete "todo lo filtrado".
  const hasExplicitBound = Boolean(dateFrom || dateTo || paymentMethod || operatorId || trimmedQuery);
  const effectiveDateFrom = dateFrom || (all || hasExplicitBound ? null : addDaysToIsoDate(today, -7));
  const effectiveDateTo = dateTo || (all || hasExplicitBound ? null : today);

  const exactRows = await fetchExactPaidStays(db, queryParkingIds, { paymentMethod, operatorId, query: trimmedQuery, dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });
  const pageRows = all ? exactRows : exactRows.slice(offset, offset + safeSize);

  // Turno por lote: solo los payment_shift_id distintos de las filas
  // finalmente devueltas (nunca de todo parking_stays) -- una única consulta
  // adicional, acotada por la cantidad real de turnos distintos, no de filas.
  const shiftIds = [...new Set(pageRows.map((stay) => stay.payment_shift_id).filter(Boolean))];
  let shiftLabelById = new Map();
  if (shiftIds.length) {
    const { data: shifts, error: shiftError } = await db.from("operator_shifts").select("id,shift_date").in("id", shiftIds);
    if (shiftError) throw shiftError;
    shiftLabelById = new Map((shifts || []).map((shift) => [shift.id, shift.shift_date ? `Turno ${shift.shift_date}` : ""]));
  }

  const rows = pageRows.map((stay) => toRevenueTransactionRow(stay, {
    parkingName: nameById.get(stay.parking_id) || "",
    companyName: companyNameById.get(stay.parking_id) || "",
    // FK real (payment_shift_id), nunca heurística por fecha+operador (§9).
    shiftLabel: stay.payment_shift_id ? shiftLabelById.get(stay.payment_shift_id) || "" : "",
  }));

  return { rows, total: exactRows.length, page: safePage, pageSize: all ? rows.length : safeSize, parkings: parkingOptions, companies };
}

// Resumen + serie diaria (§3/§12): reutiliza fetchExactPaidStays con LOS
// MISMOS filtros que la tabla (paymentMethod/operatorId) -- así los KPIs
// nunca quedan desalineados de lo que el usuario ve filtrado. La búsqueda de
// texto libre es la única excepción deliberada (no se pasa aquí): filtrar el
// resumen por una coincidencia de texto sobre patente/ticket/código de pago
// no tiene una lectura financiera clara ("recaudación total de una
// búsqueda"), así que el resumen siempre refleja el universo real del
// período/empresa/estacionamiento/medio de pago/operador, documentado en la
// UI. Nunca dos consultas independientes para el mismo período: UNA sola
// trae el detalle que alimenta resumen Y serie diaria.
export async function getRevenueOverview(db, scopedParkings, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const parkings = offStreetParkings(scopedParkings);
  const { candidateParkings, queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId: options.parkingId, companyId: options.companyId });

  const today = operationalTodayIso(now);
  const dateFrom = options.dateFrom || `${today.slice(0, 7)}-01`;
  const dateTo = options.dateTo || today;

  if (!queryParkingIds.length) {
    return {
      summary: summarizeRevenueRows([]),
      dailySeries: buildDailyRevenueSeries([], dateFrom, dateTo),
      cashDifference: summarizeCashDifferences([]),
      dateFrom,
      dateTo,
    };
  }

  const exactRows = await fetchExactPaidStays(db, queryParkingIds, { paymentMethod: options.paymentMethod || null, operatorId: options.operatorId || null, query: null, dateFrom, dateTo });

  // Diferencias de caja (§3, condicional): shift_closures reales de esos
  // mismos parkings dentro del rango -- misma consulta acotada, no un
  // segundo cálculo de recaudación. Sin techo silencioso (mismo mecanismo).
  const closureIds = candidateParkings.map((parking) => parking.id);
  const closureQueryFactory = () => db.from("shift_closures").select("cash_difference")
    .in("parking_id", closureIds)
    .gte("actual_close_at", `${addDaysToIsoDate(dateFrom, -1)}T00:00:00.000Z`)
    .lte("actual_close_at", `${addDaysToIsoDate(dateTo, 1)}T23:59:59.999Z`)
    .order("actual_close_at", { ascending: false });
  const closureRows = await fetchAllMatchingRows(closureQueryFactory);

  return {
    summary: summarizeRevenueRows(exactRows),
    dailySeries: buildDailyRevenueSeries(exactRows, dateFrom, dateTo),
    cashDifference: summarizeCashDifferences(closureRows.map((row) => ({ cashDifference: row.cash_difference != null ? Number(row.cash_difference) : null }))),
    dateFrom,
    dateTo,
  };
}

// Cierres de caja reales (§5/§8): shift_closures, acotado a estacionamientos
// OFF_STREET del scope -- nunca un cierre On Street ni de otro tenant. Solo
// reproyecta la fila ya calculada por close_operator_shift (toRevenueClosureRow),
// cero recálculo. Sin techo silencioso (mismo mecanismo que transacciones).
export async function searchRevenueClosures(db, scopedParkings, options = {}) {
  const { dateFrom = null, dateTo = null, parkingId = null, companyId = null, operatorId = null, page, pageSize } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });

  const parkings = offStreetParkings(scopedParkings);
  const { queryParkingIds } = resolveQueryParkingIds(parkings, { parkingId, companyId });

  if (!queryParkingIds.length) {
    return { rows: [], total: 0, page: safePage, pageSize: safeSize };
  }

  const today = operationalTodayIso();
  const hasExplicitBound = Boolean(dateFrom || dateTo || operatorId);
  const effectiveDateFrom = dateFrom || (hasExplicitBound ? null : addDaysToIsoDate(today, -30));
  const effectiveDateTo = dateTo || (hasExplicitBound ? null : today);

  const queryFactory = () => {
    let q = db.from("shift_closures").select(closureFields).in("parking_id", queryParkingIds);
    if (operatorId) q = q.eq("operator_id", operatorId);
    if (effectiveDateFrom) q = q.gte("actual_close_at", `${addDaysToIsoDate(effectiveDateFrom, -1)}T00:00:00.000Z`);
    if (effectiveDateTo) q = q.lte("actual_close_at", `${addDaysToIsoDate(effectiveDateTo, 1)}T23:59:59.999Z`);
    return q.order("actual_close_at", { ascending: false });
  };
  const widened = await fetchAllMatchingRows(queryFactory);
  const exactRows = filterRowsByExactOperationalDateRange(widened, "actual_close_at", effectiveDateFrom, effectiveDateTo);
  const rows = exactRows.slice(offset, offset + safeSize).map((row) => toRevenueClosureRow(row));

  return { rows, total: exactRows.length, page: safePage, pageSize: safeSize };
}
