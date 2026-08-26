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
import { AuthorizationError } from "./auth/contextCore.mjs";

const parkingFields = "id,code,name,company_name,address,city,status,company:companies(business_name,address,district,city,rut_number,rut_dv,phone)";
const stayFields = "id,code,parking_id,license_plate,qr_token,status,entry_at,entry_operator_name,entry_source,exit_at,exit_operator_name,elapsed_minutes,rate_name,billing_mode,net_amount,tax_amount,total_amount,payment_method,payment_code,coupon_id,coupon_code,discount_amount,subtotal_amount";
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
