// Feriados propios de cada cliente (SOL-2026-10-08-003, D14). Los usan las
// tarifas por franja horaria: un feriado se cobra con el juego marcado para
// feriados. Sin la migración 20261008100000 se comportan como "sin feriados".

import { isMissingTimeBandsSchema } from "./parkingRatesRepository.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidHolidayDate(value) {
  if (!ISO_DATE.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const mapHoliday = (row) => ({ id: row.id, date: row.holiday_date, label: row.label || "", createdAt: row.created_at });

export async function listCompanyHolidays(db, companyId, { from = null, to = null } = {}) {
  if (!companyId) return [];
  let query = db.from("parking_holidays").select("id,holiday_date,label,created_at").eq("company_id", companyId).order("holiday_date");
  if (from) query = query.gte("holiday_date", from);
  if (to) query = query.lte("holiday_date", to);
  const { data, error } = await query;
  if (error) {
    if (isMissingTimeBandsSchema(error)) return [];
    throw error;
  }
  return (data || []).map(mapHoliday);
}

// Fechas de feriado que pueden afectar una estadía (con un día de margen a cada
// lado por la diferencia entre UTC y la hora de Chile).
export async function listHolidayDatesForStay(db, companyId, entryAt, exitAt) {
  const from = new Date(new Date(entryAt).getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(new Date(exitAt).getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const holidays = await listCompanyHolidays(db, companyId, { from, to });
  return holidays.map((holiday) => holiday.date);
}

export class HolidayInputError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export async function addCompanyHoliday(db, { companyId, date, label, createdBy }) {
  if (!isValidHolidayDate(date)) throw new HolidayInputError("Ingresa una fecha válida.", "HOLIDAY_DATE_INVALID");
  const { data, error } = await db.from("parking_holidays").insert({
    company_id: companyId, holiday_date: date, label: String(label || "").trim().slice(0, 80), created_by: createdBy || null,
  }).select("id,holiday_date,label,created_at").single();
  if (error) {
    if (error.code === "23505") throw new HolidayInputError("Esa fecha ya está registrada como feriado.", "HOLIDAY_DUPLICATED");
    throw error;
  }
  return mapHoliday(data);
}

export async function removeCompanyHoliday(db, { companyId, holidayId }) {
  const { data, error } = await db.from("parking_holidays").delete().eq("id", holidayId).eq("company_id", companyId).select("id");
  if (error) throw error;
  return (data || []).length > 0;
}
