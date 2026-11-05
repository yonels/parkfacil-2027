import "server-only";
import { getDashboardCapacityByParking } from "./offStreetDashboardCapacity.js";
import { getOpenCountsByParking } from "./offStreetReportsService.js";
import { applyLiveOccupancy } from "./parkingLiveOccupancy.mjs";

export async function withLiveOccupancy(db, parkings = []) {
  const offStreet = parkings.filter((parking) => parking.type === "OFF_STREET");
  if (!offStreet.length) return parkings;
  const [capacityByParking, openCounts] = await Promise.all([
    getDashboardCapacityByParking(db, offStreet),
    getOpenCountsByParking(db, offStreet.map((parking) => parking.id)),
  ]);
  return applyLiveOccupancy(parkings, capacityByParking, openCounts);
}
