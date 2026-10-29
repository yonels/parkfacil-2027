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

// Edición de turnos (SOL-2026-10-29-005). Un turno abierto solo se termina con
// «Cerrar turno» (cierre de caja): desde Editar no cambia de estado, operador ni
// fecha. Programado puede abrirse o cancelarse; cancelado puede reprogramarse.
export const SHIFT_STATUS_LABELS = { PROGRAMMED: "Programado", OPEN: "Abierto", CANCELLED: "Cancelado" };

export function shiftEditStatusOptions(currentStatus) {
  if (!currentStatus) return ["PROGRAMMED", "OPEN"];
  if (currentStatus === "OPEN") return ["OPEN"];
  if (currentStatus === "PROGRAMMED") return ["PROGRAMMED", "OPEN", "CANCELLED"];
  if (currentStatus === "CANCELLED") return ["CANCELLED", "PROGRAMMED"];
  return [];
}

// null si el cambio es válido; si no, el motivo para mostrar.
export function shiftEditViolation(current, input) {
  if (!shiftEditStatusOptions(current?.status).includes(input?.status || "PROGRAMMED")) {
    return current?.status === "OPEN"
      ? "Un turno abierto no cambia de estado desde Editar: termínalo con «Cerrar turno»."
      : "Estado inválido para este turno.";
  }
  if (current?.status === "OPEN" && (input.operatorId !== current.operator_id || input.date !== current.shift_date)) {
    return "Un turno abierto no cambia de operador ni de fecha.";
  }
  return null;
}
