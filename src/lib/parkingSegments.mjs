export const STREET_SIDES = ["BOTH", "EVEN", "ODD"];
export const SEGMENT_STATES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];

export function sanitizeStreetSegment(input = {}) {
  return {
    code: String(input.code || "").trim().toUpperCase().slice(0, 20),
    name: String(input.name || "").trim().slice(0, 120),
    fromNumber: Number(input.fromNumber),
    toNumber: Number(input.toNumber),
    streetSide: STREET_SIDES.includes(input.streetSide) ? input.streetSide : null,
    capacity: Number(input.capacity),
    occupiedSpaces: Number(input.occupiedSpaces || 0),
    status: SEGMENT_STATES.includes(input.status) ? input.status : null,
    sortOrder: Number(input.sortOrder || 0),
    notes: String(input.notes || "").trim().slice(0, 500),
  };
}

export function segmentRangesOverlap(first, second) {
  if (first.status === "INACTIVE" || second.status === "INACTIVE") return false;
  const compatibleSide = first.streetSide === "BOTH" || second.streetSide === "BOTH" || first.streetSide === second.streetSide;
  return compatibleSide && first.fromNumber <= second.toNumber && second.fromNumber <= first.toNumber;
}

export function validateStreetSegment(input, existing = [], currentId = null) {
  const errors = {};
  if (!input.code) errors.code = "El código es obligatorio.";
  if (!input.name) errors.name = "El nombre es obligatorio.";
  if (!Number.isInteger(input.fromNumber) || input.fromNumber < 0) errors.fromNumber = "Ingresa una numeración inicial válida.";
  if (!Number.isInteger(input.toNumber) || input.toNumber < input.fromNumber) errors.toNumber = "La numeración final debe ser igual o superior a la inicial.";
  if (!STREET_SIDES.includes(input.streetSide)) errors.streetSide = "Selecciona el lado de la calle.";
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) errors.capacity = "La capacidad debe ser mayor que cero.";
  if (!Number.isInteger(input.occupiedSpaces) || input.occupiedSpaces < 0 || input.occupiedSpaces > input.capacity) errors.occupiedSpaces = "Las plazas ocupadas deben estar entre cero y la capacidad.";
  if (!SEGMENT_STATES.includes(input.status)) errors.status = "Selecciona un estado válido.";
  if (existing.some((item) => item.id !== currentId && item.code === input.code)) errors.code = "El código ya existe en esta calle.";
  if (existing.some((item) => item.id !== currentId && segmentRangesOverlap(input, item))) errors.range = "El rango se superpone con otro tramo activo del mismo lado.";
  return errors;
}
