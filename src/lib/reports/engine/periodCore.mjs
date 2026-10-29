// Motor común de reportes (SOL-2026-10-28-005, E2): períodos en la zona
// operacional America/Santiago. Hoy, Ayer, Semana (lunes a domingo), Mes,
// Año y Personalizado. Rango [desde, hasta) en instantes UTC.

import { addLocalDays, localParts, parseLocalDate, RELEASED_PAYMENT_TIME_ZONE, zonedLocalToUtc } from "../../releasedPayment/zonedTime.mjs";

export const REPORT_TIME_ZONE = RELEASED_PAYMENT_TIME_ZONE;
export const PERIOD_PRESETS = Object.freeze({ TODAY: "hoy", YESTERDAY: "ayer", WEEK: "semana", MONTH: "mes", YEAR: "anio", CUSTOM: "personalizado" });
export const PERIOD_LABELS = Object.freeze({ hoy: "Hoy", ayer: "Ayer", semana: "Semana", mes: "Mes", anio: "Año", personalizado: "Personalizado" });
export const MAX_CUSTOM_DAYS = 400;

const pad = (n) => String(n).padStart(2, "0");
const dateText = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;
const displayDate = ({ year, month, day }) => `${pad(day)}-${pad(month)}-${year}`;
const startOf = (date, tz) => zonedLocalToUtc({ ...date, hour: 0, minute: 0 }, tz);

/**
 * Resuelve el período. `from`/`to` (YYYY-MM-DD, ambos inclusive) solo para
 * Personalizado. Devuelve { ok, preset, fromIso, toIso, fromDate, toDate, label }
 * o { ok: false, error }.
 */
export function resolvePeriod(preset = PERIOD_PRESETS.MONTH, { from = "", to = "", now = Date.now(), timeZone = REPORT_TIME_ZONE } = {}) {
  const today = localParts(now, timeZone);
  const todayDate = { year: today.year, month: today.month, day: today.day };
  let first;
  let last;
  switch (preset) {
    case PERIOD_PRESETS.TODAY: first = todayDate; last = todayDate; break;
    case PERIOD_PRESETS.YESTERDAY: first = addLocalDays(todayDate, -1); last = first; break;
    case PERIOD_PRESETS.WEEK: first = addLocalDays(todayDate, -(today.weekday - 1)); last = addLocalDays(first, 6); break;
    case PERIOD_PRESETS.MONTH: first = { year: today.year, month: today.month, day: 1 }; last = { year: today.year, month: today.month, day: new Date(Date.UTC(today.year, today.month, 0)).getUTCDate() }; break;
    case PERIOD_PRESETS.YEAR: first = { year: today.year, month: 1, day: 1 }; last = { year: today.year, month: 12, day: 31 }; break;
    case PERIOD_PRESETS.CUSTOM: {
      first = parseLocalDate(from);
      last = parseLocalDate(to);
      if (!first || !last) return { ok: false, error: "Indica fecha desde y hasta (AAAA-MM-DD)." };
      const days = (Date.UTC(last.year, last.month - 1, last.day) - Date.UTC(first.year, first.month - 1, first.day)) / 86400000;
      if (days < 0) return { ok: false, error: "La fecha hasta debe ser igual o posterior a la fecha desde." };
      if (days + 1 > MAX_CUSTOM_DAYS) return { ok: false, error: `El período personalizado no puede superar ${MAX_CUSTOM_DAYS} días.` };
      break;
    }
    default: return { ok: false, error: "Período no válido." };
  }
  const fromMs = startOf(first, timeZone);
  const toMs = startOf(addLocalDays(last, 1), timeZone);
  return {
    ok: true,
    preset,
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    fromDate: dateText(first),
    toDate: dateText(last),
    label: first.year === last.year && first.month === last.month && first.day === last.day
      ? `${PERIOD_LABELS[preset]} · ${displayDate(first)}`
      : `${PERIOD_LABELS[preset]} · ${displayDate(first)} al ${displayDate(last)}`,
    timeZone,
  };
}

// Intervalo [aFrom, aTo) se cruza con el período [fromIso, toIso).
export function overlapsPeriod(aFrom, aTo, period) {
  return new Date(aFrom).getTime() < new Date(period.toIso).getTime() && new Date(aTo).getTime() > new Date(period.fromIso).getTime();
}
