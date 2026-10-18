// Off Street — Pago liberado: conversión entre hora local de la zona
// operacional y UTC, sin dependencias. Los estacionamientos no tienen zona
// horaria propia (hallazgo Fase B): se usa la zona operacional del proyecto
// (America/Santiago, ver OPERATIONAL_TIME_ZONE en dataEntry.mjs), incluido
// el cambio de horario de verano.

export const RELEASED_PAYMENT_TIME_ZONE = "America/Santiago";

const formatters = new Map();
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    }));
  }
  return formatters.get(timeZone);
}

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Partes locales de un instante: año, mes, día, hora, minuto y día ISO de la
// semana (1 = lunes ... 7 = domingo).
export function localParts(instant, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday],
  };
}

function offsetMs(instantMs, timeZone) {
  const p = localParts(instantMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

// Instante UTC (ms) de una fecha/hora local. En el salto de primavera una
// hora local inexistente avanza al primer instante válido.
export function zonedLocalToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(result, timeZone);
  if (second !== result) result = Math.max(result, second);
  return result;
}

// "2026-10-04" -> { year, month, day }
export function parseLocalDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

// "09:30" -> minutos desde medianoche.
export function parseTimeOfDay(value) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// "2026-10-04T09:30" (hora local) -> ms UTC.
export function parseLocalDateTime(value, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) return null;
  const date = parseLocalDate(match[1]);
  const minutes = parseTimeOfDay(match[2]);
  if (!date || minutes === null) return null;
  return zonedLocalToUtc({ ...date, hour: Math.floor(minutes / 60), minute: minutes % 60 }, timeZone);
}

export function addLocalDays({ year, month, day }, days) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// Mismo cálculo que public.released_payment_contract_end: horas exactas;
// días, meses y años calendario a la misma hora local.
export function contractEndMs(startsAtMs, billingUnit, quantity, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  if (billingUnit === "HOUR") return startsAtMs + quantity * 3600000;
  const p = localParts(startsAtMs, timeZone);
  if (billingUnit === "DAY") {
    const date = addLocalDays(p, quantity);
    return zonedLocalToUtc({ ...date, hour: p.hour, minute: p.minute }, timeZone) + p.second * 1000;
  }
  // Meses y años (12 meses) calendario: un mes sin el día de inicio termina
  // en su último día (31-01 + 1 mes = 28/29-02); 29-02 + 1 año = 28-02 si el
  // año de término no es bisiesto. Nunca 1 mes = 30 días ni 1 año = 365.
  if (billingUnit === "MONTH" || billingUnit === "YEAR") {
    const totalMonths = p.month - 1 + (billingUnit === "YEAR" ? quantity * 12 : quantity);
    const year = p.year + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return zonedLocalToUtc({ year, month, day: Math.min(p.day, lastDay), hour: p.hour, minute: p.minute }, timeZone) + p.second * 1000;
  }
  return null;
}

export function formatLocalDateTime(instant, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  if (instant === null || instant === undefined) return "";
  const p = localParts(instant, timeZone);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(p.day)}-${pad(p.month)}-${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

// Valor para <input type="datetime-local"> en la zona operacional.
export function toLocalInputValue(instant, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  if (instant === null || instant === undefined || instant === "") return "";
  const p = localParts(instant, timeZone);
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
