export const HOME_VEHICLE_ROW_HEIGHT = 44;

export function sortHomeVehicles(stays) {
  return [...(Array.isArray(stays) ? stays : [])].sort((a, b) => {
    const timestamp = (stay) => {
      const value = Date.parse(stay?.entry_at);
      return Number.isFinite(value) ? value : Infinity;
    };
    const left = timestamp(a);
    const right = timestamp(b);
    return (left === right ? 0 : left < right ? -1 : 1) || String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

export function homeVehicleMinutes(entryAt, now) {
  const entry = Date.parse(entryAt);
  return Number.isFinite(entry) && Number.isFinite(now) ? Math.max(0, Math.floor((now - entry) / 60000)) : null;
}

export function homeVehiclePagination(total, height, requestedPage) {
  const pageSize = Math.max(1, Math.floor(Math.max(0, height) / HOME_VEHICLE_ROW_HEIGHT));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pageCount, requestedPage));
  return { pageSize, pageCount, page, start: (page - 1) * pageSize };
}

export function configuredParkingCapacity(zones) {
  if (!Array.isArray(zones) || !zones.length) return null;
  const capacity = zones.reduce((sum, zone) => {
    const value = Number(zone?.capacity);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  return capacity > 0 ? capacity : null;
}
