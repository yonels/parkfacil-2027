import test from "node:test";
import assert from "node:assert/strict";

import { OPERATIONAL_TIME_ZONE } from "./dataEntry.mjs";
import {
  TIME_BANDS_TIME_ZONE,
  buildChargeBreakdown,
  calculateTimeBandCharge,
  createZonedClock,
  formatMinuteOfDay,
  parseMinuteOfDay,
  summarizeChargeBreakdown,
  validateTimeBandSets,
} from "./parkingTimeBands.mjs";

const hm = (text) => parseMinuteOfDay(text);
const band = (label, start, end, minuteAmount, capAmount = null) => ({ label, startMinute: hm(start), endMinute: hm(end), minuteAmount, capAmount });

// Configuración del diseño (DISENO.md §2): hábil lun-vie, sábado, domingo+feriados.
const HABIL = { label: "Hábil", daysOfWeek: [1, 2, 3, 4, 5], bands: [
  band("Mañana", "07:00", "12:00", 35),
  band("Mediodía", "12:00", "15:00", 20),
  band("Tarde", "15:00", "17:00", 25),
  band("Noche", "17:00", "07:00", 20, 10000),
] };
const SABADO = { label: "Sábado", daysOfWeek: [6], bands: [
  band("Día", "08:00", "14:00", 25),
  band("Noche", "14:00", "08:00", 15, 8000),
] };
const DOMINGO = { label: "Domingo y feriados", daysOfWeek: [7], appliesToHolidays: true, bands: [band("Todo el día", "00:00", "00:00", 15, 6000)] };
const SETS = [HABIL, SABADO, DOMINGO];

// Octubre 2026: Chile en horario de verano (UTC-3). 2026-10-12 es lunes.
const at = (date, time) => `${date}T${time}:00-03:00`;
const charge = (from, to, extra = {}) => calculateTimeBandCharge({ sets: SETS, entryAt: from, exitAt: to, ...extra });

test("la zona horaria coincide con la operacional del sistema", () => {
  assert.equal(TIME_BANDS_TIME_ZONE, OPERATIONAL_TIME_ZONE);
});

test("formato y lectura de horas", () => {
  assert.equal(formatMinuteOfDay(0), "00:00");
  assert.equal(formatMinuteOfDay(1020), "17:00");
  assert.equal(parseMinuteOfDay("07:00"), 420);
  assert.equal(parseMinuteOfDay("24:00"), 0);
  assert.equal(parseMinuteOfDay("7:5"), null);
  assert.equal(parseMinuteOfDay("25:00"), null);
});

test("configuración del diseño es válida", () => {
  assert.deepEqual(validateTimeBandSets(SETS), {});
});

test("validaciones de cobertura y forma", () => {
  assert.ok(validateTimeBandSets([]).timeBands);
  const gap = [{ ...HABIL, bands: [band("A", "07:00", "11:50", 35), ...HABIL.bands.slice(1)] }, SABADO, DOMINGO];
  assert.match(Object.values(validateTimeBandSets(gap)).join(" "), /sin huecos ni superposiciones/);
  const overlap = [{ ...HABIL, bands: [band("A", "07:00", "12:10", 35), ...HABIL.bands.slice(1)] }, SABADO, DOMINGO];
  assert.match(Object.values(validateTimeBandSets(overlap)).join(" "), /sin huecos ni superposiciones/);
  const missingFriday = [{ ...HABIL, daysOfWeek: [1, 2, 3, 4] }, SABADO, DOMINGO];
  assert.match(validateTimeBandSets(missingFriday).day_5, /Viernes no tiene/);
  const duplicated = [{ ...HABIL, daysOfWeek: [1, 2, 3, 4, 5, 6] }, SABADO, DOMINGO];
  assert.match(validateTimeBandSets(duplicated).day_6, /más de un juego/);
  const twoHoliday = [{ ...HABIL, appliesToHolidays: true }, SABADO, DOMINGO];
  assert.ok(validateTimeBandSets(twoHoliday).holidays);
  const singleNot24 = [HABIL, SABADO, { ...DOMINGO, bands: [band("X", "00:00", "12:00", 15)] }];
  assert.match(Object.values(validateTimeBandSets(singleNot24)).join(" "), /24 horas/);
  const zeroPrice = [{ ...HABIL, bands: [band("A", "07:00", "12:00", 0), ...HABIL.bands.slice(1)] }, SABADO, DOMINGO];
  assert.match(Object.values(validateTimeBandSets(zeroPrice)).join(" "), /mayor que cero/);
  const decimals = [{ ...HABIL, bands: [band("A", "07:00", "12:00", 1.12345), ...HABIL.bands.slice(1)] }, SABADO, DOMINGO];
  assert.match(Object.values(validateTimeBandSets(decimals)).join(" "), /4 decimales/);
  const badCap = [{ ...HABIL, bands: [...HABIL.bands.slice(0, 3), band("Noche", "17:00", "07:00", 20, 0)] }, SABADO, DOMINGO];
  assert.match(Object.values(validateTimeBandSets(badCap)).join(" "), /tope debe ser mayor/);
  const tooMany = [{ ...HABIL, bands: Array.from({ length: 9 }, (_, i) => band(`B${i}`, formatMinuteOfDay(i * 160), formatMinuteOfDay(((i + 1) % 9) * 160), 1)) }, SABADO, DOMINGO];
  assert.match(Object.values(validateTimeBandSets(tooMany)).join(" "), /máximo 8/);
  const sameStart = [{ ...HABIL, bands: [band("A", "07:00", "12:00", 1), band("B", "07:00", "07:00", 1)] }, SABADO, DOMINGO];
  assert.ok(Object.keys(validateTimeBandSets(sameStart)).length > 0);
  const noDays = [HABIL, SABADO, DOMINGO, { label: "Vacío", daysOfWeek: [], bands: [band("X", "00:00", "00:00", 1)] }];
  assert.match(Object.values(validateTimeBandSets(noDays)).join(" "), /asigna al menos un día/);
});

test("reloj de Chile: verano -03 en octubre e invierno -04 en julio", () => {
  const clock = createZonedClock();
  assert.deepEqual(clock(Date.parse("2026-10-12T12:00:00Z")), { date: "2026-10-12", minuteOfDay: 540, weekday: 1 });
  assert.deepEqual(clock(Date.parse("2026-07-13T12:00:00Z")), { date: "2026-07-13", minuteOfDay: 480, weekday: 1 });
});

test("ejemplos del diseño (DISENO.md §3)", () => {
  assert.equal(charge(at("2026-10-12", "09:00"), at("2026-10-12", "10:00")).amount, 2100);
  assert.equal(charge(at("2026-10-12", "11:50"), at("2026-10-12", "12:10")).amount, 550);
  assert.equal(charge(at("2026-10-12", "14:30"), at("2026-10-12", "17:30")).amount, 4200);
  assert.equal(charge(at("2026-10-12", "08:00"), at("2026-10-12", "18:00")).amount, 16200);
  const overnight = charge(at("2026-10-12", "16:00"), at("2026-10-13", "08:00"));
  assert.equal(overnight.amount, 13600);
  assert.deepEqual(overnight.passes.map((p) => [p.label, p.minutes, p.grossAmount, p.capApplied, p.amount]), [
    ["Tarde", 60, 1500, false, 1500],
    ["Noche", 840, 16800, true, 10000],
    ["Mañana", 60, 2100, false, 2100],
  ]);
  assert.equal(overnight.passes[1].bandDate, "2026-10-12");
  assert.equal(charge(at("2026-10-12", "22:00"), at("2026-10-13", "07:00")).amount, 10000);
});

test("salida sin pago (ejemplo D15): 14:30 a cierre de turno 20:00 = $7.200", () => {
  assert.equal(charge(at("2026-10-12", "14:30"), at("2026-10-12", "20:00")).amount, 7200);
});

test("minutos incompletos nunca se cobran", () => {
  assert.equal(charge(at("2026-10-12", "09:00"), "2026-10-12T09:00:59-03:00").amount, 0);
  assert.equal(charge(at("2026-10-12", "09:00"), "2026-10-12T09:01:59-03:00").amount, 35);
  // Minuto que comienza 11:59 se cobra al precio de la mañana aunque termine 12:00.
  const boundary = charge("2026-10-12T11:59:00-03:00", "2026-10-12T12:01:00-03:00");
  assert.deepEqual(boundary.passes.map((p) => [p.label, p.minutes]), [["Mañana", 1], ["Mediodía", 1]]);
  assert.equal(boundary.amount, 55);
});

test("período gratuito solo al ingreso", () => {
  const result = charge(at("2026-10-12", "11:50"), at("2026-10-12", "12:10"), { freePeriodSeconds: 600 });
  assert.equal(result.chargedMinutes, 10);
  assert.equal(result.amount, 200);
  // Una estadía que cruza las 07:00 no recibe otro período gratuito.
  const night = charge(at("2026-10-12", "06:30"), at("2026-10-12", "07:30"), { freePeriodSeconds: 600 });
  assert.equal(night.amount, 20 * 20 + 30 * 35);
});

test("fin de semana: la noche del viernes usa el juego del viernes", () => {
  // Viernes 2026-10-16 16:00 -> sábado 10:00
  const result = charge(at("2026-10-16", "16:00"), at("2026-10-17", "10:00"));
  assert.deepEqual(result.passes.map((p) => [p.setLabel, p.label, p.bandDate, p.minutes, p.amount]), [
    ["Hábil", "Tarde", "2026-10-16", 60, 1500],
    ["Hábil", "Noche", "2026-10-16", 840, 10000],
    ["Sábado", "Noche", "2026-10-17", 60, 900],
    ["Sábado", "Día", "2026-10-17", 120, 3000],
  ]);
  assert.equal(result.amount, 15400);
});

test("feriado del cliente usa el juego de feriados; sin feriado usa el día de la semana", () => {
  const holiday = charge(at("2026-10-12", "09:00"), at("2026-10-12", "10:00"), { holidays: ["2026-10-12"] });
  assert.equal(holiday.amount, 900);
  assert.equal(holiday.passes[0].setLabel, "Domingo y feriados");
  assert.equal(charge(at("2026-10-12", "09:00"), at("2026-10-12", "10:00")).amount, 2100);
});

test("domingo sin franja cruzada: madrugada del lunes usa el juego del lunes", () => {
  // Domingo 2026-10-18 20:00 -> lunes 09:00
  const result = charge(at("2026-10-18", "20:00"), at("2026-10-19", "09:00"));
  assert.deepEqual(result.passes.map((p) => [p.label, p.bandDate, p.minutes, p.amount]), [
    ["Todo el día", "2026-10-18", 240, 3600],
    ["Noche", "2026-10-19", 420, 8400],
    ["Mañana", "2026-10-19", 120, 4200],
  ]);
  assert.equal(result.amount, 16200);
});

test("la misma franja en días consecutivos tiene un tope por día", () => {
  const sets = [{ label: "Todo", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], bands: [band("Día", "00:00", "00:00", 15, 6000)] }];
  const result = calculateTimeBandCharge({ sets, entryAt: at("2026-10-17", "00:00"), exitAt: at("2026-10-19", "00:00") });
  assert.equal(result.passes.length, 2);
  assert.equal(result.amount, 12000);
});

test("estadías de varios días ya no quedan bloqueadas; más de 400 días sí", () => {
  const long = charge(at("2026-10-01", "08:00"), at("2026-10-10", "17:00"));
  assert.equal(long.valid, true);
  assert.equal(long.requiresDailyPolicy, undefined);
  assert.ok(long.amount > 0);
  assert.equal(long.passes.reduce((sum, p) => sum + p.minutes, 0), long.chargedMinutes);
  const tooLong = charge("2025-01-01T08:00:00-03:00", "2026-03-01T08:00:00-03:00");
  assert.equal(tooLong.requiresDailyPolicy, true);
});

test("precio con decimales sin errores de coma flotante", () => {
  const sets = [{ label: "Todo", daysOfWeek: [1, 2, 3, 4, 5, 6, 7], bands: [band("Día", "00:00", "00:00", 0.29)] }];
  const result = calculateTimeBandCharge({ sets, entryAt: at("2026-10-12", "09:00"), exitAt: at("2026-10-12", "10:40") });
  assert.equal(result.chargedMinutes, 100);
  assert.equal(result.amount, 29); // 0.29 * 100 = 28.999999... en coma flotante
});

test("salida igual o anterior al ingreso es inválida", () => {
  assert.equal(charge(at("2026-10-12", "09:00"), at("2026-10-12", "09:00")).valid, false);
  assert.equal(charge(at("2026-10-12", "09:00"), at("2026-10-12", "08:00")).valid, false);
});

// Implementación de referencia independiente (sin caché de desfase, Intl en cada
// minuto) para comparar contra el motor en estadías al azar, incluidos los días
// de cambio de horario de Chile 2026 (5-abr y 6-sep).
function referenceAmount(sets, entryMs, exitMs, freeSeconds = 0) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const setFor = (weekday) => sets.find((s) => s.daysOfWeek.includes(weekday));
  const prevWeekday = (weekday) => (weekday === 1 ? 7 : weekday - 1);
  const minutes = Math.floor(Math.max(0, Math.floor((exitMs - entryMs) / 1000) - freeSeconds) / 60);
  const passes = [];
  for (let i = 0; i < minutes; i += 1) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(entryMs + freeSeconds * 1000 + i * 60000)).map((p) => [p.type, p.value]));
    const mod = Number(parts.hour) * 60 + Number(parts.minute);
    const weekday = weekdayMap[parts.weekday];
    const dayKey = `${parts.year}-${parts.month}-${parts.day}`;
    let chosen = null;
    const prev = setFor(prevWeekday(weekday));
    const crossing = prev.bands.find((b) => b.startMinute > b.endMinute);
    // La continuación pertenece al día anterior: misma clave que la parte de la
    // noche que comenzó ese día (un solo tope por noche).
    const previousDayKey = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1)).toISOString().slice(0, 10);
    if (crossing && mod < crossing.endMinute) chosen = { b: crossing, key: `own-${previousDayKey}-${prev.label}-${crossing.label}` };
    if (!chosen) {
      const own = setFor(weekday);
      const b = own.bands.find((x) => x.startMinute === x.endMinute || (x.startMinute < x.endMinute ? mod >= x.startMinute && mod < x.endMinute : mod >= x.startMinute || mod < x.endMinute));
      chosen = { b, key: `own-${dayKey}-${own.label}-${b.label}` };
    }
    const last = passes[passes.length - 1];
    if (last && last.key === chosen.key) last.minutes += 1;
    else passes.push({ key: chosen.key, minutes: 1, b: chosen.b });
  }
  return passes.reduce((sum, p) => {
    const gross = Math.floor((p.minutes * Math.round(p.b.minuteAmount * 10000)) / 10000);
    return sum + (p.b.capAmount != null && gross > p.b.capAmount ? p.b.capAmount : gross);
  }, 0);
}

test("coincide con la implementación de referencia en 300 estadías al azar (incluye cambios de horario)", () => {
  let seed = 20261008;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const anchors = ["2026-04-03T12:00:00Z", "2026-09-04T12:00:00Z", "2026-10-12T12:00:00Z", "2026-07-01T12:00:00Z"];
  for (let i = 0; i < 300; i += 1) {
    const anchor = Date.parse(anchors[i % anchors.length]);
    const entryMs = anchor + Math.floor(random() * 3 * 86400) * 1000;
    const exitMs = entryMs + Math.floor(random() * 4 * 86400) * 1000 + Math.floor(random() * 59) * 1000;
    const free = random() < 0.3 ? 600 : 0;
    const result = calculateTimeBandCharge({ sets: SETS, entryAt: new Date(entryMs), exitAt: new Date(exitMs), freePeriodSeconds: free });
    if (exitMs <= entryMs) continue;
    assert.equal(result.amount, referenceAmount(SETS, entryMs, exitMs, free), `estadía ${new Date(entryMs).toISOString()} -> ${new Date(exitMs).toISOString()}`);
    assert.equal(result.passes.reduce((sum, p) => sum + p.minutes, 0), result.chargedMinutes);
  }
});

test("cambio de horario (6-sep-2026, se adelanta 1 h): se cobran solo minutos reales", () => {
  // Sábado 5-sep 23:00 (-04) a domingo 6-sep 02:00 (-03): 2 horas reales.
  const result = charge("2026-09-05T23:00:00-04:00", "2026-09-06T02:00:00-03:00");
  assert.equal(result.chargedMinutes, 120);
  assert.equal(result.passes.reduce((sum, p) => sum + p.minutes, 0), 120);
});

test("desglose compacto y resumen para el comprobante", () => {
  const result = charge(at("2026-10-12", "16:00"), at("2026-10-13", "08:00"));
  const breakdown = buildChargeBreakdown(result, { rateId: "r1" });
  assert.equal(breakdown.kind, "TIME_BANDS");
  assert.equal(breakdown.amount, 13600);
  assert.equal(breakdown.capApplied, true);
  assert.equal(breakdown.passes.length, 3);
  assert.equal(summarizeChargeBreakdown(breakdown), "Minuto efectivo según horario · tope aplicado");
  const noCap = buildChargeBreakdown(charge(at("2026-10-12", "09:00"), at("2026-10-12", "10:00")));
  assert.equal(summarizeChargeBreakdown(noCap), "Minuto efectivo según horario");
  // La Ley 20.967 llama "tramo" a otra modalidad (tramo vencido): nunca debe aparecer.
  assert.doesNotMatch(summarizeChargeBreakdown(breakdown), /tramo/i);
  assert.equal(buildChargeBreakdown({ valid: false }), null);
  assert.equal(summarizeChargeBreakdown(null), "");
});
