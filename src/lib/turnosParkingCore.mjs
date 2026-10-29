// Off Street → Operación → Turnos (SOL-2026-10-29-005). Puro, sin red.

// Solo estacionamientos Off Street, activos primero y luego por código.
export function offStreetShiftParkings(parkings) {
  return (Array.isArray(parkings) ? parkings : [])
    .filter((parking) => parking?.type === "OFF_STREET")
    .sort((a, b) => Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") || String(a.code).localeCompare(String(b.code), "es"));
}

// El elegido por código (o id) si está en la lista; si no, el primero de la lista.
export function pickShiftParking(parkings, identifier) {
  const wanted = String(identifier || "").trim().toUpperCase();
  return (wanted && parkings.find((parking) => String(parking.code).toUpperCase() === wanted || String(parking.id).toUpperCase() === wanted)) || parkings[0] || null;
}
