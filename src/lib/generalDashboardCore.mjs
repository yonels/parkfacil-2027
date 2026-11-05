// Cálculos puros del Dashboard General (SOL-2026-11-05-003), a partir de filas reales de
// parking_stays. Usa las mismas reglas que el detalle (activityReportCore.mjs): Ingresos por
// entry_at; Salidas solo PAID por exit_at; Pendientes OPEN y Anulados CANCELLED por entry_at.
import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "./dataEntry.mjs";
import { addDaysToIsoDate, operationalDateToIso } from "./pos/activityReportCore.mjs";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const FLOW_PERIODS = Object.freeze(["Hoy", "7 días", "Mes", "Año"]);
export const OCCUPANCY_HOURS = Object.freeze(["06–09", "09–12", "12–15", "15–18", "18–21", "21–00"]);
const OCCUPANCY_START_HOURS = [6, 9, 12, 15, 18, 21];
const WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const OCCUPANCY_WINDOW_DAYS = 28;

const operationalIso = (value) => (value ? operationalDateToIso(toOperationalDateTimeParts(value, OPERATIONAL_TIME_ZONE)?.entryDate) : null);
const operationalHour = (value) => Number(String(toOperationalDateTimeParts(value, OPERATIONAL_TIME_ZONE)?.entryTime || "").slice(0, 2));
const inRange = (iso, from, to) => Boolean(iso) && iso >= from && iso <= to;
const monthEnd = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const monthRange = (month) => ({ from: `${month}-01`, to: monthEnd(month) });

export function flowRange(period, today) {
  if (period === "Hoy") return { from: today, to: today, group: "day" };
  if (period === "Mes") return { from: `${today.slice(0, 7)}-01`, to: today, group: "day" };
  if (period === "Año") return { from: `${today.slice(0, 4)}-01-01`, to: today, group: "month" };
  return { from: addDaysToIsoDate(today, -6), to: today, group: "day" };
}

export function summarizeActivity(rows, from, to) {
  const summary = { pendientes: 0, ingresos: 0, salidas: 0, anulados: 0 };
  for (const row of rows || []) {
    if (inRange(operationalIso(row.entry_at), from, to)) {
      summary.ingresos += 1;
      if (row.status === "OPEN") summary.pendientes += 1;
      if (row.status === "CANCELLED") summary.anulados += 1;
    }
    if (row.status === "PAID" && inRange(operationalIso(row.exit_at), from, to)) summary.salidas += 1;
  }
  return summary;
}

// Totales por medio de pago desde el resumen real de Recaudación (summarizeRevenueRows).
export function paymentsFromRevenue(summary = {}) {
  const amount = (value) => Number(value) || 0;
  const items = { efectivo: amount(summary.cashAmount), debito: amount(summary.debitAmount), credito: amount(summary.creditAmount), sinClasificar: amount(summary.unclassifiedCardAmount) };
  const total = items.efectivo + items.debito + items.credito + items.sinClasificar;
  const share = (value) => (total > 0 ? Math.round((value / total) * 100) : 0);
  return { ...items, total, count: Number(summary.count) || 0, shares: { efectivo: share(items.efectivo), debito: share(items.debito), credito: share(items.credito), sinClasificar: share(items.sinClasificar) } };
}

function dayLabel(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function buildFlowSeries(rows, from, to, group = "day") {
  const buckets = new Map();
  if (group === "month") {
    for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = addDaysToIsoDate(monthEnd(month), 1).slice(0, 7)) {
      const range = monthRange(month);
      buckets.set(month, { label: `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`, from: range.from, to: range.to > to ? to : range.to, entries: 0, exits: 0 });
    }
  } else {
    for (let day = from; day <= to; day = addDaysToIsoDate(day, 1)) buckets.set(day, { label: dayLabel(day), from: day, to: day, entries: 0, exits: 0 });
  }
  const keyFor = (iso) => (group === "month" ? iso.slice(0, 7) : iso);
  for (const row of rows || []) {
    const entry = operationalIso(row.entry_at);
    if (inRange(entry, from, to)) buckets.get(keyFor(entry)).entries += 1;
    const exit = operationalIso(row.exit_at);
    if (row.status === "PAID" && inRange(exit, from, to)) buckets.get(keyFor(exit)).exits += 1;
  }
  return [...buckets.values()];
}

export function summarizeFlow(series = []) {
  const entries = series.reduce((sum, item) => sum + item.entries, 0);
  const exits = series.reduce((sum, item) => sum + item.exits, 0);
  const busiest = series.reduce((best, item) => (item.entries + item.exits > (best ? best.entries + best.exits : 0) ? item : best), null);
  return { busiestLabel: busiest?.label || null, balance: entries - exits, averageEntries: series.length ? Math.round(entries / series.length) : 0 };
}

export function buildHourlyFlow(rows, date) {
  const buckets = Array.from({ length: 8 }, (_, index) => ({ hour: `${String(index * 3).padStart(2, "0")}:00`, entries: 0, exits: 0 }));
  for (const row of rows || []) {
    if (operationalIso(row.entry_at) === date) buckets[Math.floor(operationalHour(row.entry_at) / 3)].entries += 1;
    if (row.status === "PAID" && operationalIso(row.exit_at) === date) buckets[Math.floor(operationalHour(row.exit_at) / 3)].exits += 1;
  }
  return buckets;
}

// Instante real de una hora de Santiago, con su horario de verano o invierno.
export function operationalInstant(iso, hour, minute = 0, timeZone = OPERATIONAL_TIME_ZONE) {
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(guess)).map((p) => [p.type, Number(p.value)]));
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (shown - guess));
}

// Mapa de calor: vehículos presentes a mitad de cada franja horaria sobre la capacidad,
// promediando las mismas franjas de los últimos 28 días. Sin capacidad o sin ocurrencias
// aún transcurridas, el valor es null: no se inventa un porcentaje.
export function buildOccupancy(rows, capacity, today, now = new Date()) {
  const usable = (rows || []).map((row) => ({ entry: new Date(row.entry_at).getTime(), exit: row.exit_at ? new Date(row.exit_at).getTime() : null, status: row.status })).filter((row) => row.status !== "CANCELLED");
  const sums = WEEK_DAYS.map(() => OCCUPANCY_START_HOURS.map(() => ({ total: 0, count: 0 })));
  if (capacity > 0) {
    for (let i = 0; i < OCCUPANCY_WINDOW_DAYS; i += 1) {
      const iso = addDaysToIsoDate(today, -i);
      const [y, m, d] = iso.split("-").map(Number);
      const weekDay = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
      OCCUPANCY_START_HOURS.forEach((hour, band) => {
        const instant = operationalInstant(iso, hour + 1, 30).getTime();
        if (instant > now.getTime()) return;
        const present = usable.filter((row) => row.entry <= instant && (row.exit !== null ? row.exit > instant : ["OPEN", "UNPAID_PENDING"].includes(row.status))).length;
        sums[weekDay][band].total += present;
        sums[weekDay][band].count += 1;
      });
    }
  }
  const out = WEEK_DAYS.map((day, weekDay) => ({ day, values: sums[weekDay].map(({ total, count }) => (count ? Math.round((total / count / capacity) * 100) : null)) }));
  let peak = null;
  out.forEach((row) => row.values.forEach((value, band) => { if (value !== null && (!peak || value > peak.value)) peak = { value, day: row.day, hours: OCCUPANCY_HOURS[band] }; }));
  return { capacity, hours: OCCUPANCY_HOURS, rows: out, peak: peak && peak.value > 0 ? peak : null };
}
