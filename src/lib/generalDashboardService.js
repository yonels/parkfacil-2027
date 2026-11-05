// Datos reales del Dashboard General (SOL-2026-11-05-003). Off Street: sus estadías viven en
// parking_stays; On Street usa otras tablas y no se incluye. Los montos salen de
// getRevenueOverview, de modo que coinciden con Recaudación.
import { addDaysToIsoDate } from "./pos/activityReportCore.mjs";
import { fetchAllMatchingRows, getRevenueOverview, offStreetParkings } from "./offStreetRevenueService.js";
import { operationalTodayIso } from "./offStreetOperationsCore.mjs";
import { buildFlowSeries, buildHourlyFlow, buildOccupancy, flowRange, monthRange, OCCUPANCY_WINDOW_DAYS, paymentsFromRevenue, summarizeActivity, summarizeFlow } from "./generalDashboardCore.mjs";

const wideFrom = (iso) => `${addDaysToIsoDate(iso, -1)}T00:00:00.000Z`;
const wideTo = (iso) => `${addDaysToIsoDate(iso, 1)}T23:59:59.999Z`;

function movementRows(db, ids, from, to) {
  if (!ids.length) return [];
  return fetchAllMatchingRows(() => db.from("parking_stays").select("entry_at,exit_at,status").in("parking_id", ids)
    .or(`and(entry_at.gte.${wideFrom(from)},entry_at.lte.${wideTo(to)}),and(exit_at.gte.${wideFrom(from)},exit_at.lte.${wideTo(to)})`)
    .order("entry_at", { ascending: false }));
}

function presenceRows(db, ids, from, now) {
  if (!ids.length) return [];
  return fetchAllMatchingRows(() => db.from("parking_stays").select("entry_at,exit_at,status").in("parking_id", ids)
    .lte("entry_at", now.toISOString()).or(`exit_at.gte.${wideFrom(from)},exit_at.is.null`)
    .order("entry_at", { ascending: false }));
}

async function countOpen(db, ids) {
  if (!ids.length) return 0;
  const { count, error } = await db.from("parking_stays").select("id", { count: "exact", head: true }).in("parking_id", ids).eq("status", "OPEN");
  if (error) throw error;
  return count || 0;
}

export async function getGeneralDashboardFlow(db, scopedParkings, { period = "7 días", now = new Date() } = {}) {
  const ids = offStreetParkings(scopedParkings).map((parking) => parking.id);
  const { from, to, group } = flowRange(period, operationalTodayIso(now));
  const series = buildFlowSeries(await movementRows(db, ids, from, to), from, to, group);
  return { period, series, summary: summarizeFlow(series) };
}

export async function getGeneralDashboardHourly(db, scopedParkings, { date }) {
  const ids = offStreetParkings(scopedParkings).map((parking) => parking.id);
  return { date, hours: buildHourlyFlow(await movementRows(db, ids, date, date), date) };
}

export async function getGeneralDashboardIncome(db, scopedParkings, { dateFrom, dateTo, now = new Date() }) {
  const revenue = await getRevenueOverview(db, scopedParkings, { dateFrom, dateTo, now });
  return { dateFrom, dateTo, payments: paymentsFromRevenue(revenue.summary) };
}

// `capacity` llega resuelta por la ruta: su cálculo importa "server-only".
export async function getGeneralDashboardOverview(db, scopedParkings, { capacity = 0, now = new Date() } = {}) {
  const parkings = offStreetParkings(scopedParkings);
  const ids = parkings.map((parking) => parking.id);
  const today = operationalTodayIso(now);
  const month = monthRange(today.slice(0, 7));
  const occupancyFrom = addDaysToIsoDate(today, -(OCCUPANCY_WINDOW_DAYS - 1));
  const [rows, presence, openNow, monthRevenue, dayRevenue, flow] = await Promise.all([
    movementRows(db, ids, month.from, today),
    presenceRows(db, ids, occupancyFrom, now),
    countOpen(db, ids),
    getRevenueOverview(db, scopedParkings, { dateFrom: month.from, dateTo: today, now }),
    getRevenueOverview(db, scopedParkings, { dateFrom: today, dateTo: today, now }),
    getGeneralDashboardFlow(db, scopedParkings, { period: "7 días", now }),
  ]);
  const monthPayments = paymentsFromRevenue(monthRevenue.summary);
  return {
    today,
    month: month.from.slice(0, 7),
    hasOffStreet: parkings.length > 0,
    parkingCount: parkings.length,
    kpis: { pending: openNow, monthlyTotal: monthPayments.total, transactions: monthPayments.count },
    activity: { day: summarizeActivity(rows, today, today), month: summarizeActivity(rows, month.from, today) },
    payments: { day: paymentsFromRevenue(dayRevenue.summary), month: monthPayments },
    flow,
    occupancy: buildOccupancy(presence, capacity, today, now),
  };
}
