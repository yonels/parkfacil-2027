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

// Reloj de la lista del inicio (QA PRO2 2026-10-19, SOL-2026-10-11-001): hora del servidor de
// la respuesta + tiempo transcurrido en el equipo DESDE QUE LLEGÓ esa respuesta. Antes se
// anclaba al montar la lista: al volver al inicio con datos anteriores, los minutos
// retrocedían a los de la última carga (p. ej. 1 y 0 en vez de 10).
export function stampStaysReceivedAt(stays, receivedAt = Date.now()) {
  return (Array.isArray(stays) ? stays : []).map((stay) => ({ ...stay, clientReceivedAt: receivedAt }));
}

export function homeVehicleClockAnchor(stays, localNow) {
  const first = Array.isArray(stays) ? stays[0] : null;
  const server = Date.parse(first?.serverNow);
  if (!Number.isFinite(server)) return { server: localNow, local: localNow };
  const received = Number(first?.clientReceivedAt);
  return { server, local: Number.isFinite(received) && received > 0 ? received : localNow };
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
