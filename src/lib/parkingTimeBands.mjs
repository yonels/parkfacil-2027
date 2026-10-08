// Motor de tarifas por franja horaria (SOL-2026-10-08-003, etapa 1).
// Diseño: docs/solicitudes/SOL-2026-10-08-003/DISENO.md (v2.1) y
// docs/MOTOR-TARIFARIO-LEGAL.md.
//
// Reglas (todas puras, sin red ni base de datos):
// - Sigue siendo minuto efectivo: se cobran minutos completos entre ingreso y
//   salida, menos el período gratuito (solo al ingreso). Nunca se redondea al alza.
// - Cada minuto se cobra al precio de la franja en que COMIENZA, según la hora
//   de Chile (America/Santiago), incluidos los cambios de horario.
// - Un día de la semana usa exactamente un juego de franjas; un feriado del
//   cliente usa el juego marcado para feriados (si existe).
// - Una franja que cruza medianoche pertenece al día en que comienza.
// - Una "pasada" es una racha continua de minutos en la misma franja del mismo
//   día de franja; si la franja tiene tope, el subtotal de esa pasada se limita
//   al tope (el tope solo reduce).
//
// No importa dataEntry.mjs (que importa parkingRates.mjs) para evitar un ciclo;
// la zona horaria se fija aquí y una prueba verifica que coincide con
// OPERATIONAL_TIME_ZONE.

export const TIME_BANDS_TIME_ZONE = "America/Santiago";

export const TIME_BAND_LIMITS = Object.freeze({
  maxSets: 7,
  maxBandsPerSet: 8,
  // Estadías más largas quedan para revisión administrativa (protección ante
  // datos anómalos; ~13 meses).
  maxStaySeconds: 400 * 86400,
  minuteAmountScale: 10000,
});

const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;

export function formatMinuteOfDay(minute) {
  const value = ((Number(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function parseMinuteOfDay(text) {
  const match = String(text ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) return 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Duración de una franja en minutos, considerando el cruce de medianoche.
// start == end solo es válido como franja única de 24 horas.
function bandDuration(band) {
  if (band.startMinute === band.endMinute) return MINUTES_PER_DAY;
  return (band.endMinute - band.startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function isInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Valida la configuración completa de juegos/franjas. Devuelve un objeto de
// errores (vacío si es válida), con el mismo estilo que validateOperationalRate.
export function validateTimeBandSets(sets) {
  const errors = {};
  if (!Array.isArray(sets) || sets.length === 0) {
    errors.timeBands = "Configura al menos un juego de franjas.";
    return errors;
  }
  if (sets.length > TIME_BAND_LIMITS.maxSets) {
    errors.timeBands = `Máximo ${TIME_BAND_LIMITS.maxSets} juegos de franjas.`;
    return errors;
  }

  const dayOwners = new Map();
  let holidaySets = 0;
  sets.forEach((set, setIndex) => {
    const label = set?.label?.trim() || `Juego ${setIndex + 1}`;
    const days = Array.isArray(set?.daysOfWeek) ? set.daysOfWeek : [];
    if (days.some((day) => !isInteger(day, 1, 7))) errors[`set_${setIndex}_days`] = `${label}: días inválidos.`;
    if (new Set(days).size !== days.length) errors[`set_${setIndex}_days`] = `${label}: hay días repetidos.`;
    days.forEach((day) => dayOwners.set(day, (dayOwners.get(day) || 0) + 1));
    if (set?.appliesToHolidays === true) holidaySets += 1;
    if (!days.length && set?.appliesToHolidays !== true) errors[`set_${setIndex}_days`] = `${label}: asigna al menos un día o feriados.`;

    const bands = Array.isArray(set?.bands) ? set.bands : [];
    if (!bands.length) {
      errors[`set_${setIndex}_bands`] = `${label}: agrega al menos una franja.`;
      return;
    }
    if (bands.length > TIME_BAND_LIMITS.maxBandsPerSet) {
      errors[`set_${setIndex}_bands`] = `${label}: máximo ${TIME_BAND_LIMITS.maxBandsPerSet} franjas.`;
      return;
    }
    let shapeOk = true;
    bands.forEach((band, bandIndex) => {
      const bandLabel = band?.label?.trim() || `Franja ${bandIndex + 1}`;
      if (!isInteger(band?.startMinute, 0, 1439) || !isInteger(band?.endMinute, 0, 1439)) {
        errors[`set_${setIndex}_band_${bandIndex}_time`] = `${label} · ${bandLabel}: horario inválido.`;
        shapeOk = false;
      }
      if (!(Number(band?.minuteAmount) > 0) || !Number.isFinite(Number(band?.minuteAmount))) {
        errors[`set_${setIndex}_band_${bandIndex}_amount`] = `${label} · ${bandLabel}: el valor por minuto debe ser mayor que cero.`;
      } else if (Math.abs(Number(band.minuteAmount) * TIME_BAND_LIMITS.minuteAmountScale
        - Math.round(Number(band.minuteAmount) * TIME_BAND_LIMITS.minuteAmountScale)) > 1e-6) {
        errors[`set_${setIndex}_band_${bandIndex}_amount`] = `${label} · ${bandLabel}: máximo 4 decimales en el valor por minuto.`;
      }
      if (band?.capAmount != null && (!(Number(band.capAmount) > 0) || !Number.isFinite(Number(band.capAmount)))) {
        errors[`set_${setIndex}_band_${bandIndex}_cap`] = `${label} · ${bandLabel}: el tope debe ser mayor que cero.`;
      }
    });
    if (!shapeOk) return;

    if (bands.length === 1) {
      if (bands[0].startMinute !== bands[0].endMinute) {
        errors[`set_${setIndex}_coverage`] = `${label}: una franja única debe cubrir las 24 horas (misma hora de inicio y término).`;
      }
      return;
    }
    const sorted = [...bands].sort((a, b) => a.startMinute - b.startMinute);
    if (sorted.some((band) => band.startMinute === band.endMinute)) {
      errors[`set_${setIndex}_coverage`] = `${label}: solo una franja única puede cubrir las 24 horas.`;
      return;
    }
    if (new Set(sorted.map((band) => band.startMinute)).size !== sorted.length) {
      errors[`set_${setIndex}_coverage`] = `${label}: dos franjas comienzan a la misma hora.`;
      return;
    }
    for (let index = 0; index < sorted.length; index += 1) {
      const next = sorted[(index + 1) % sorted.length];
      if (sorted[index].endMinute !== next.startMinute) {
        errors[`set_${setIndex}_coverage`] = `${label}: las franjas deben cubrir las 24 horas sin huecos ni superposiciones (revisa ${formatMinuteOfDay(sorted[index].endMinute)}).`;
        return;
      }
    }
    const total = sorted.reduce((sum, band) => sum + bandDuration(band), 0);
    if (total !== MINUTES_PER_DAY) {
      errors[`set_${setIndex}_coverage`] = `${label}: las franjas deben sumar 24 horas.`;
    }
  });

  for (let day = 1; day <= 7; day += 1) {
    const owners = dayOwners.get(day) || 0;
    const dayName = WEEKDAY_NAMES[day];
    if (owners === 0) errors[`day_${day}`] = `${dayName} no tiene juego de franjas.`;
    if (owners > 1) errors[`day_${day}`] = `${dayName} está en más de un juego de franjas.`;
  }
  if (holidaySets > 1) errors.holidays = "Solo un juego de franjas puede aplicarse a feriados.";
  return errors;
}

export const WEEKDAY_NAMES = Object.freeze({ 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo" });

// --- Hora local (America/Santiago) -------------------------------------------

const offsetFormatterCache = new Map();
function offsetFormatter(timeZone) {
  if (!offsetFormatterCache.has(timeZone)) {
    offsetFormatterCache.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }));
  }
  return offsetFormatterCache.get(timeZone);
}

// Desfase (ms) entre la hora local y UTC para un instante. Chile cambia de
// horario en horas exactas, por lo que el desfase es constante dentro de cada
// hora UTC; se memoriza por hora para no llamar a Intl en cada minuto.
export function createZonedClock(timeZone = TIME_BANDS_TIME_ZONE) {
  const cache = new Map();
  function offsetAt(ms) {
    const bucket = Math.floor(ms / MS_PER_HOUR);
    if (cache.has(bucket)) return cache.get(bucket);
    const parts = Object.fromEntries(offsetFormatter(timeZone).formatToParts(new Date(bucket * MS_PER_HOUR))
      .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const offset = wall - bucket * MS_PER_HOUR;
    cache.set(bucket, offset);
    return offset;
  }
  return function localParts(ms) {
    const local = new Date(ms + offsetAt(ms));
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth() + 1;
    const day = local.getUTCDate();
    const weekdayJs = local.getUTCDay();
    return {
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
      weekday: weekdayJs === 0 ? 7 : weekdayJs,
    };
  };
}

function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function weekdayOfDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const weekdayJs = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekdayJs === 0 ? 7 : weekdayJs;
}

// --- Resolución de franja -----------------------------------------------------

function normalizeSets(sets) {
  return sets.map((set, setIndex) => ({
    key: set.id || `set-${setIndex}`,
    sequence: Number(set.sequence ?? setIndex + 1),
    label: set.label || `Juego ${setIndex + 1}`,
    daysOfWeek: (set.daysOfWeek || []).map(Number),
    appliesToHolidays: set.appliesToHolidays === true,
    bands: [...(set.bands || [])].map((band, bandIndex) => ({
      key: band.id || `band-${setIndex}-${bandIndex}`,
      sequence: Number(band.sequence ?? bandIndex + 1),
      label: band.label || `Franja ${bandIndex + 1}`,
      startMinute: Number(band.startMinute),
      endMinute: Number(band.endMinute),
      minuteAmount: Number(band.minuteAmount),
      priceUnits: Math.round(Number(band.minuteAmount) * TIME_BAND_LIMITS.minuteAmountScale),
      capAmount: band.capAmount == null ? null : Number(band.capAmount),
    })).sort((a, b) => a.startMinute - b.startMinute),
  }));
}

function bandContains(band, minuteOfDay) {
  if (band.startMinute === band.endMinute) return true;
  if (band.startMinute < band.endMinute) return minuteOfDay >= band.startMinute && minuteOfDay < band.endMinute;
  return minuteOfDay >= band.startMinute || minuteOfDay < band.endMinute;
}

function createBandResolver(sets, holidays) {
  const holidaySet = sets.find((set) => set.appliesToHolidays) || null;
  const byWeekday = new Map();
  sets.forEach((set) => set.daysOfWeek.forEach((day) => byWeekday.set(day, set)));
  function setForDate(isoDate) {
    if (holidaySet && holidays.has(isoDate)) return holidaySet;
    return byWeekday.get(weekdayOfDate(isoDate)) || null;
  }
  return function resolve(localDate, minuteOfDay) {
    // 1) Continuación de una franja que comenzó el día anterior y cruza medianoche.
    const previousDate = shiftDate(localDate, -1);
    const previousSet = setForDate(previousDate);
    if (previousSet) {
      const crossing = previousSet.bands.find((band) => band.startMinute > band.endMinute);
      if (crossing && minuteOfDay < crossing.endMinute) {
        return { set: previousSet, band: crossing, bandDate: previousDate };
      }
    }
    // 2) Franja del juego del propio día.
    const currentSet = setForDate(localDate);
    if (!currentSet) return null;
    const band = currentSet.bands.find((item) => bandContains(item, minuteOfDay));
    return band ? { set: currentSet, band, bandDate: localDate } : null;
  };
}

// --- Cálculo ------------------------------------------------------------------

// Calcula el cobro de una estadía con franjas. `holidays`: fechas YYYY-MM-DD del
// cliente. Devuelve el mismo contrato que calculateParkingCharge más `passes`.
export function calculateTimeBandCharge({ sets, freePeriodSeconds = 0, entryAt, exitAt, holidays = [], timeZone = TIME_BANDS_TIME_ZONE }) {
  const errors = validateTimeBandSets(sets);
  if (Object.keys(errors).length) return { valid: false, errors };
  const entryMs = new Date(entryAt).getTime();
  const exitMs = new Date(exitAt).getTime();
  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || !(exitMs > entryMs)) {
    return { valid: false, errors: { stay: "La salida debe ser posterior al ingreso." } };
  }
  const elapsedSeconds = Math.floor((exitMs - entryMs) / 1000);
  const freeSeconds = Math.max(0, Math.floor(Number(freePeriodSeconds) || 0));
  const chargeableSeconds = Math.max(0, elapsedSeconds - freeSeconds);
  if (elapsedSeconds > TIME_BAND_LIMITS.maxStaySeconds) {
    return { valid: true, requiresDailyPolicy: true, elapsedSeconds, chargeableSeconds };
  }
  const chargedMinutes = Math.floor(chargeableSeconds / 60);
  const normalized = normalizeSets(sets);
  const holidayDates = new Set([...(holidays || [])].map(String));
  const resolve = createBandResolver(normalized, holidayDates);
  const localParts = createZonedClock(timeZone);
  const firstMinuteMs = entryMs + freeSeconds * 1000;

  const passes = [];
  let current = null;
  for (let index = 0; index < chargedMinutes; index += 1) {
    const minuteStartMs = firstMinuteMs + index * MS_PER_MINUTE;
    const local = localParts(minuteStartMs);
    const match = resolve(local.date, local.minuteOfDay);
    if (!match) return { valid: false, errors: { timeBands: `No hay franja para ${local.date} ${formatMinuteOfDay(local.minuteOfDay)}.` } };
    const passKey = `${match.bandDate}|${match.set.key}|${match.band.key}`;
    if (!current || current.passKey !== passKey) {
      current = {
        passKey,
        bandDate: match.bandDate,
        setSequence: match.set.sequence,
        setLabel: match.set.label,
        bandSequence: match.band.sequence,
        label: match.band.label,
        startMinute: match.band.startMinute,
        endMinute: match.band.endMinute,
        minuteAmount: match.band.minuteAmount,
        priceUnits: match.band.priceUnits,
        capAmount: match.band.capAmount,
        fromMs: minuteStartMs,
        minutes: 0,
      };
      passes.push(current);
    }
    current.minutes += 1;
    current.toMs = minuteStartMs + MS_PER_MINUTE;
  }

  let amount = 0;
  const breakdown = passes.map((pass) => {
    const grossAmount = Math.floor((pass.minutes * pass.priceUnits) / TIME_BAND_LIMITS.minuteAmountScale);
    const capApplied = pass.capAmount != null && grossAmount > pass.capAmount;
    const passAmount = capApplied ? Math.floor(pass.capAmount) : grossAmount;
    amount += passAmount;
    return {
      bandDate: pass.bandDate,
      setSequence: pass.setSequence,
      setLabel: pass.setLabel,
      bandSequence: pass.bandSequence,
      label: pass.label,
      bandStart: formatMinuteOfDay(pass.startMinute),
      bandEnd: formatMinuteOfDay(pass.endMinute),
      from: new Date(pass.fromMs).toISOString(),
      to: new Date(pass.toMs).toISOString(),
      minutes: pass.minutes,
      minuteAmount: pass.minuteAmount,
      grossAmount,
      capAmount: pass.capAmount,
      capApplied,
      amount: passAmount,
    };
  });

  return {
    valid: true,
    amount,
    elapsedSeconds,
    chargeableSeconds,
    chargedMinutes,
    spacesUsed: 1,
    chargedBlocks: [],
    passes: breakdown,
  };
}

// Desglose compacto que se firma en la cotización POS y se guarda en
// parking_stays.charge_breakdown.
export function buildChargeBreakdown(charge, { rateId = null, timeZone = TIME_BANDS_TIME_ZONE } = {}) {
  if (!charge?.valid || !Array.isArray(charge.passes)) return null;
  return {
    version: 1,
    kind: "TIME_BANDS",
    timeZone,
    rateId,
    chargedMinutes: charge.chargedMinutes,
    amount: charge.amount,
    capApplied: charge.passes.some((pass) => pass.capApplied),
    passes: charge.passes.map((pass) => ({
      bandDate: pass.bandDate,
      label: pass.label,
      setLabel: pass.setLabel,
      bandStart: pass.bandStart,
      bandEnd: pass.bandEnd,
      from: pass.from,
      to: pass.to,
      minutes: pass.minutes,
      minuteAmount: pass.minuteAmount,
      grossAmount: pass.grossAmount,
      capAmount: pass.capAmount,
      capApplied: pass.capApplied,
      amount: pass.amount,
    })),
  };
}

// Resumen de una línea para el comprobante actual (etapa 1, sin APK nueva).
// Nunca usa la palabra "tramo": en la Ley 20.967 "tramo vencido" es otra
// modalidad, y las franjas son minuto efectivo con precio según la hora.
export function summarizeChargeBreakdown(breakdown) {
  if (!breakdown?.passes?.length) return "";
  const base = "Minuto efectivo según horario";
  return breakdown.passes.some((pass) => pass.capApplied) ? `${base} · tope aplicado` : base;
}
