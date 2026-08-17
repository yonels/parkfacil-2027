import { quoteParkingStay } from "./parkingStayQuoteService.js";
import { filterPaidStaysForOperationalDay, summarizeDailyPayments, toDailyPaymentRow } from "./pos/paymentsDayCore.mjs";

const parkingFields = "id,name,company_name,address,city,status,company:companies(business_name,address,district,city,rut_number,rut_dv,phone)";
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
  const quoteFn = options.quoteFn || quoteParkingStay;
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

  const quote = await quoteFn(db, stay, { now });
  return {
    parking,
    serverNow: toIsoTimestamp(now),
    stay: { ...stay, serverNow: toIsoTimestamp(now) },
    quote: { ...quote, calculatedAt: toIsoTimestamp(now) },
  };
}
