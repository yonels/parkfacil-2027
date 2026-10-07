import { addDaysToIsoDate, filterRowsByExactOperationalDateRange } from "./pos/activityReportCore.mjs";
import { operationalTodayIso, computeOperationsSummary } from "./offStreetOperationsCore.mjs";
import { fetchAllMatchingRows } from "./offStreetRevenueService.js";

export async function getOperationsSummary(db, scopedParkings, { now = new Date() } = {}) {
  const ids = (scopedParkings || []).map((parking) => parking.id);
  if (!ids.length) return computeOperationsSummary({ openCount: 0, entriesToday: [], exitsToday: [] });
  const today = operationalTodayIso(now);
  const from = `${addDaysToIsoDate(today, -1)}T00:00:00.000Z`;
  const to = `${addDaysToIsoDate(today, 1)}T23:59:59.999Z`;
  const [open, entries, exits] = await Promise.all([
    db.from("parking_stays").select("id", { count: "exact", head: true }).in("parking_id", ids).eq("status", "OPEN"),
    fetchAllMatchingRows(() => db.from("parking_stays").select("id,entry_at").in("parking_id", ids).gte("entry_at", from).lte("entry_at", to).order("id")),
    fetchAllMatchingRows(() => db.from("parking_stays").select("id,exit_at").in("parking_id", ids).eq("status", "PAID").gte("exit_at", from).lte("exit_at", to).order("id")),
  ]);
  if (open.error) throw open.error;
  return computeOperationsSummary({ openCount: open.count || 0,
    entriesToday: filterRowsByExactOperationalDateRange(entries, "entry_at", today, today),
    exitsToday: filterRowsByExactOperationalDateRange(exits, "exit_at", today, today) });
}
