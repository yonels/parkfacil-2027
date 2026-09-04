import { quoteParkingStay, quoteParkingStayById } from "./parkingStayQuoteService.js";
import { filterPaidStaysForOperationalDay, summarizeDailyPayments, toDailyPaymentRow } from "./pos/paymentsDayCore.mjs";
import {
  addDaysToIsoDate,
  dateFieldForActivity,
  filterRowsByExactOperationalDateRange,
  normalizePagination,
  statusForActivity,
  toActivityReportRow,
} from "./pos/activityReportCore.mjs";
import {
  computeOperationsSummary,
  movementDateField,
  operationalTodayIso,
  toOperationDetail,
  toOperationRow,
} from "./offStreetOperationsCore.mjs";
import { AuthorizationError } from "./auth/contextCore.mjs";

const parkingFields = "id,code,name,company_name,address,city,status,company:companies(business_name,address,district,city,rut_number,rut_dv,phone)";
const stayFields = "id,code,parking_id,license_plate,qr_token,status,entry_at,entry_operator_name,entry_source,exit_at,exit_operator_name,elapsed_minutes,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,coupon_id,coupon_code,discount_amount,subtotal_amount";
// Extensión de stayFields solo para el detalle de /operacion/[id] -- ids de
// operador/turno que la tabla/listado no necesita (evita ampliar la fila del
// listado, que ya viaja paginada, con columnas que solo usa la ficha).
const stayDetailFields = `${stayFields},entry_operator_id,exit_operator_id,entry_shift_id,payment_shift_id`;
// Ventana amplia (36h) usada solo para acotar la consulta SQL antes de filtrar
// por día operacional en memoria; evita calcular límites UTC exactos para
// America/Santiago (con sus cambios de horario) directamente en la query.
const DAILY_PAYMENTS_LOOKBACK_MS = 36 * 60 * 60 * 1000;

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value || Date.now()).toISOString();
}

async function loadParking(db, parkingId) {
  const { data, error } = await db.from("parkings").select(parkingFields).eq("id", parkingId).eq("status", "ACTIVE").maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadOpenStays(db, parkingId) {
  const { data, error } = await db.from("parking_stays").select(stayFields).eq("parking_id", parkingId).eq("status", "OPEN").order("entry_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listOpenPosStays(db, parkingId, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const quoteFn = options.quoteFn || quoteParkingStay;
  const parking = await loadParking(db, parkingId);
  if (!parking) return { parking: null, serverNow: toIsoTimestamp(now), stays: [] };

  const stays = await loadOpenStays(db, parkingId);
  const listedStays = await Promise.all(stays.map(async (stay) => ({
    ...stay,
    serverNow: toIsoTimestamp(now),
    quote: await quoteFn(db, stay, { now }),
  })));

  return { parking, serverNow: toIsoTimestamp(now), stays: listedStays };
}

async function loadRecentPaidStays(db, parkingId, since) {
  const { data, error } = await db
    .from("parking_stays")
    .select(stayFields)
    .eq("parking_id", parkingId)
    .eq("status", "PAID")
    .gte("exit_at", since.toISOString())
    .order("exit_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Pagos confirmados (PAID) del día operacional actual, acotados al parking
// asignado. La empresa queda acotada de forma transitiva: `parking` se carga
// filtrado por el mismo parkingId ya autorizado para el operador (ver
// requireOperationalParking en la capa de autorización), y todas las
// estadías consultadas se filtran por ese mismo parking_id — nunca se leen
// datos de otros parkings ni de otra empresa.
export async function listDailyPosPayments(db, parkingId, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const parking = await loadParking(db, parkingId);
  if (!parking) return { parking: null, serverNow: toIsoTimestamp(now), payments: [], totals: summarizeDailyPayments([]) };

  const since = new Date(now.getTime() - DAILY_PAYMENTS_LOOKBACK_MS);
  const recentPaidStays = await loadRecentPaidStays(db, parkingId, since);
  const todaysStays = filterPaidStaysForOperationalDay(recentPaidStays, { now });

  return {
    parking,
    serverNow: toIsoTimestamp(now),
    payments: todaysStays.map((stay) => toDailyPaymentRow(stay)),
    totals: summarizeDailyPayments(todaysStays),
  };
}

export async function quoteOpenPosStay(db, parkingId, stayId, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const parking = await loadParking(db, parkingId);
  if (!parking) return { parking: null, serverNow: toIsoTimestamp(now), stay: null, quote: null };

  const { data: stay, error } = await db
    .from("parking_stays")
    .select(stayFields)
    .eq("parking_id", parkingId)
    .eq("id", stayId)
    .eq("status", "OPEN")
    .maybeSingle();

  if (error) throw error;
  if (!stay) return { parking, serverNow: toIsoTimestamp(now), stay: null, quote: null };

  const quoted = await (options.quoteFn ? options.quoteFn(db, stay, { now }) : quoteParkingStayById(db, stayId, { now, includePosSnapshot: true }));
  const quote = quoted?.quote || quoted || null;
  return {
    parking,
    serverNow: toIsoTimestamp(now),
    stay: { ...stay, serverNow: toIsoTimestamp(now) },
    quote: { ...quote, calculatedAt: toIsoTimestamp(now) },
  };
}

// Consulta real de actividad (INGRESOS/SALIDAS/PENDIENTES/ANULADOS + medio
// de pago) para el modal de detalle de /modelo-dashboard.
//
// `scopedParkings` viene YA resuelto por el llamador (la ruta, vía
// listParkings(db, authorization.scope) — mismo aislamiento por empresa/
// estacionamiento que usa el resto de la app) y no se vuelve a resolver
// aquí a propósito: estacionamientosRepository.js importa "server-only", lo
// que impediría probar este archivo con `node --test` si se importara
// directamente. Mantener la resolución de scope en la capa de ruta (igual
// que ya hace /api/estacionamientos) deja esta función pura de esa
// dependencia y con el mismo mock de base de datos que el resto del
// archivo. Si se pide un parkingId puntual, debe estar dentro de
// `scopedParkings` o se rechaza como recurso no encontrado (mismo criterio
// que requireOperationalParking).
export async function searchActivityReport(db, scopedParkings, options = {}) {
  const { activity = null, parkingId = null, dateFrom = null, dateTo = null, paymentMethod = null, page, pageSize } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });

  const parkings = Array.isArray(scopedParkings) ? scopedParkings : [];
  const parkingOptions = parkings.map((parking) => ({ id: parking.id, code: parking.code, name: parking.name }));
  const parkingNameById = new Map(parkings.map((parking) => [parking.id, parking.name]));

  let queryParkingIds = parkings.map((parking) => parking.id);
  if (parkingId) {
    const normalized = String(parkingId).toUpperCase();
    const match = parkings.find((parking) => parking.id.toUpperCase() === normalized || parking.code.toUpperCase() === normalized);
    if (!match) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el estacionamiento solicitado.", null);
    queryParkingIds = [match.id];
  }

  if (!queryParkingIds.length) {
    return { rows: [], total: 0, page: safePage, pageSize: safeSize, parkings: parkingOptions };
  }

  const status = statusForActivity(activity);
  const dateField = dateFieldForActivity(activity);

  let query = db.from("parking_stays").select(stayFields).in("parking_id", queryParkingIds);
  if (status) query = query.eq("status", status);
  if (paymentMethod) query = query.eq("payment_method", paymentMethod);
  // Margen de ±1 día en UTC para no perder filas por el desfase de huso
  // horario frente a America/Santiago; el recorte exacto ocurre después con
  // filterRowsByExactOperationalDateRange, ya en memoria.
  if (dateFrom) query = query.gte(dateField, `${addDaysToIsoDate(dateFrom, -1)}T00:00:00.000Z`);
  if (dateTo) query = query.lte(dateField, `${addDaysToIsoDate(dateTo, 1)}T23:59:59.999Z`);
  query = query.order(dateField, { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const exactRows = filterRowsByExactOperationalDateRange(data || [], dateField, dateFrom, dateTo);
  const rows = exactRows.map((stay) => toActivityReportRow({ ...stay, parking_name: parkingNameById.get(stay.parking_id) || "" }));

  return {
    rows: rows.slice(offset, offset + safeSize),
    total: rows.length,
    page: safePage,
    pageSize: safeSize,
    parkings: parkingOptions,
  };
}

// ============================================================
// /operacion (reemplazo del módulo demo src/data/operacion.mjs) --
// consulta administrativa real sobre parking_stays: listado con filtros
// (empresa/estacionamiento/estado/patente/ticket/rango de fechas) + ficha de
// detalle. Mismo patrón de aislamiento que searchActivityReport: recibe
// `scopedParkings` YA resuelto por la ruta (listParkings(db,
// authorization.scope)), nunca vuelve a resolver el scope aquí.
// ============================================================

function uniqueCompaniesFromParkings(parkings) {
  const map = new Map();
  for (const parking of parkings) {
    if (parking.companyId && !map.has(parking.companyId)) {
      map.set(parking.companyId, { id: parking.companyId, name: parking.companyName || "Empresa asociada" });
    }
  }
  return [...map.values()];
}

// Consulta real de /operacion: lista de estadías con los mismos filtros del
// alcance funcional. `movement` decide el campo de fecha (entries->entry_at,
// exits->exit_at); `status`/`query` (patente o ticket) acotan
// independientemente. Cuando no llega ningún filtro (carga inicial) se acota
// a los últimos 7 días para no cargar la historia operacional completa (ver
// §11 del alcance); un estado, búsqueda o rango explícito levanta ese límite
// por defecto porque el usuario ya está acotando la consulta por su cuenta.
export async function searchOperationStays(db, scopedParkings, options = {}) {
  const { status = null, movement = null, dateFrom = null, dateTo = null, paymentMethod = null, parkingId = null, companyId = null, query = null, page, pageSize } = options;
  const { page: safePage, pageSize: safeSize, offset } = normalizePagination({ page, pageSize });

  const parkings = Array.isArray(scopedParkings) ? scopedParkings : [];
  const companies = uniqueCompaniesFromParkings(parkings);
  const nameById = new Map(parkings.map((parking) => [parking.id, parking.name]));
  const codeById = new Map(parkings.map((parking) => [parking.id, parking.code]));
  const companyNameById = new Map(parkings.map((parking) => [parking.id, parking.companyName || ""]));

  let candidateParkings = companyId ? parkings.filter((parking) => parking.companyId === companyId) : parkings;
  const parkingOptions = candidateParkings.map((parking) => ({ id: parking.id, code: parking.code, name: parking.name, companyId: parking.companyId, companyName: parking.companyName }));

  let queryParkingIds = candidateParkings.map((parking) => parking.id);
  if (parkingId) {
    const normalized = String(parkingId).toUpperCase();
    const match = candidateParkings.find((parking) => parking.id.toUpperCase() === normalized || parking.code.toUpperCase() === normalized);
    if (!match) throw new AuthorizationError("RESOURCE_NOT_FOUND", 404, "No se encontró el estacionamiento solicitado.", null);
    queryParkingIds = [match.id];
  }

  if (!queryParkingIds.length) {
    return { rows: [], total: 0, page: safePage, pageSize: safeSize, parkings: parkingOptions, companies };
  }

  const trimmedQuery = typeof query === "string" ? query.trim() : "";
  const dateField = movementDateField(movement);
  const today = operationalTodayIso();
  const hasExplicitBound = Boolean(dateFrom || dateTo || status || trimmedQuery);
  const effectiveDateFrom = dateFrom || (hasExplicitBound ? null : addDaysToIsoDate(today, -7));
  const effectiveDateTo = dateTo || (hasExplicitBound ? null : today);

  let dbQuery = db.from("parking_stays").select(stayFields).in("parking_id", queryParkingIds);
  if (status) dbQuery = dbQuery.eq("status", status);
  if (paymentMethod) dbQuery = dbQuery.eq("payment_method", paymentMethod);
  // Patente o ticket -- búsqueda principal del alcance (§5). ilike sobre
  // ambas columnas reales, nunca sobre el uuid interno.
  if (trimmedQuery) dbQuery = dbQuery.or(`license_plate.ilike.%${trimmedQuery}%,code.ilike.%${trimmedQuery}%`);
  // Margen de ±1 día en UTC (mismo criterio que searchActivityReport) para no
  // perder filas por el desfase de huso horario frente a America/Santiago;
  // el recorte exacto ocurre después con filterRowsByExactOperationalDateRange.
  if (effectiveDateFrom) dbQuery = dbQuery.gte(dateField, `${addDaysToIsoDate(effectiveDateFrom, -1)}T00:00:00.000Z`);
  if (effectiveDateTo) dbQuery = dbQuery.lte(dateField, `${addDaysToIsoDate(effectiveDateTo, 1)}T23:59:59.999Z`);
  // Tope defensivo (§11): ningún filtro debe poder traer la historia
  // operacional completa a memoria, incluso si el resto de las condiciones
  // quedara insuficientemente acotado.
  dbQuery = dbQuery.order(dateField, { ascending: false }).limit(1000);

  const { data, error } = await dbQuery;
  if (error) throw error;

  const exactRows = filterRowsByExactOperationalDateRange(data || [], dateField, effectiveDateFrom, effectiveDateTo);
  const rows = exactRows.map((stay) => toOperationRow(stay, {
    parkingName: nameById.get(stay.parking_id) || "",
    parkingCode: codeById.get(stay.parking_id) || "",
    companyName: companyNameById.get(stay.parking_id) || "",
  }));

  return {
    rows: rows.slice(offset, offset + safeSize),
    total: rows.length,
    page: safePage,
    pageSize: safeSize,
    parkings: parkingOptions,
    companies,
  };
}

// Resumen superior de /operacion (§2): 3 consultas acotadas (nunca una
// carga completa de parking_stays) -- OPEN sin límite de fecha (un vehículo
// puede llevar varios días dentro y sigue contando), entradas/salidas solo
// del día operacional real (America/Santiago).
export async function getOperationsSummary(db, scopedParkings, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const parkings = Array.isArray(scopedParkings) ? scopedParkings : [];
  const parkingIds = parkings.map((parking) => parking.id);
  if (!parkingIds.length) return computeOperationsSummary({ openCount: 0, entriesToday: [], exitsToday: [] });

  const today = operationalTodayIso(now);
  const from = addDaysToIsoDate(today, -1);
  const to = addDaysToIsoDate(today, 1);

  const [openResult, entriesResult, exitsResult] = await Promise.all([
    // "Vehículos dentro" solo necesita el conteo -- head:true + count:'exact'
    // evita transferir el cuerpo de cada fila OPEN solo para contarlas.
    db.from("parking_stays").select("id", { count: "exact", head: true }).in("parking_id", parkingIds).eq("status", "OPEN"),
    db.from("parking_stays").select("id,entry_at").in("parking_id", parkingIds).gte("entry_at", `${from}T00:00:00.000Z`).lte("entry_at", `${to}T23:59:59.999Z`),
    db.from("parking_stays").select("id,exit_at").in("parking_id", parkingIds).eq("status", "PAID").gte("exit_at", `${from}T00:00:00.000Z`).lte("exit_at", `${to}T23:59:59.999Z`),
  ]);
  if (openResult.error) throw openResult.error;
  if (entriesResult.error) throw entriesResult.error;
  if (exitsResult.error) throw exitsResult.error;

  const entriesToday = filterRowsByExactOperationalDateRange(entriesResult.data || [], "entry_at", today, today);
  const exitsToday = filterRowsByExactOperationalDateRange(exitsResult.data || [], "exit_at", today, today);

  return computeOperationsSummary({ openCount: openResult.count || 0, entriesToday, exitsToday });
}

// Ficha /operacion/[id]: cualquier estado (no solo OPEN, a diferencia de
// quoteOpenPosStay) -- acotada a los parkings ya autorizados (`scopedParkings`),
// nunca a un id suelto sin validar pertenencia. El turno asociado (§8) solo
// se resuelve aquí (no en el listado): entry_shift_id/payment_shift_id son
// FK reales a operator_shifts (ver migración
// 20260817130000_operator_shifts_pos_traceability.sql), pero muchas
// estadías (históricas, Webpay) los tienen NULL -- eso es correcto, no se
// completa retrospectivamente ningún turno.
export async function getOperationStayById(db, scopedParkings, stayId) {
  const parkings = Array.isArray(scopedParkings) ? scopedParkings : [];
  const parkingIds = parkings.map((parking) => parking.id);
  if (!parkingIds.length || !stayId) return null;

  const { data: stay, error } = await db.from("parking_stays").select(stayDetailFields).eq("id", stayId).in("parking_id", parkingIds).maybeSingle();
  if (error) throw error;
  if (!stay) return null;

  const parking = parkings.find((item) => item.id === stay.parking_id) || null;

  const shiftIds = [...new Set([stay.entry_shift_id, stay.payment_shift_id].filter(Boolean))];
  let shiftsById = new Map();
  if (shiftIds.length) {
    const { data: shifts, error: shiftError } = await db.from("operator_shifts").select("id,shift_date,operator_id,status").in("id", shiftIds);
    if (shiftError) throw shiftError;
    shiftsById = new Map((shifts || []).map((shift) => [shift.id, shift]));
  }

  return toOperationDetail(stay, {
    parking,
    entryShift: stay.entry_shift_id ? shiftsById.get(stay.entry_shift_id) || null : null,
    paymentShift: stay.payment_shift_id ? shiftsById.get(stay.payment_shift_id) || null : null,
  });
}
