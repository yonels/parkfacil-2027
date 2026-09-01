export const STREET_SIDES = ["BOTH", "EVEN", "ODD"];
export const SEGMENT_STATES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];

// Corrección UX "Proyectos On Street" (2026-08-29): el Tramo se presenta al
// usuario como letra (A, B, C... Z, AA, AB...) en vez del número técnico
// "sort_order". Es la misma numeración bijective de columnas de hoja de
// cálculo (A=1...Z=26, AA=27...) -- se extiende sola más allá de Z sin caso
// especial. Solo se usa en pantallas On Street nuevas (OnStreetSegmentForm);
// Off Street sigue mostrando "Orden" como número libre, sin cambios (ver
// StreetSegmentsManager.js/SegmentForm.js, compartidos con Off Street).
export function sortOrderToLetter(sortOrder) {
  let n = Number(sortOrder);
  if (!Number.isInteger(n) || n < 1) return "A";
  let letters = "";
  while (n > 0) {
    n -= 1;
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26);
  }
  return letters;
}

export function letterToSortOrder(letter) {
  const clean = String(letter || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(clean)) return 1;
  let n = 0;
  for (const ch of clean) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

// El código de Tramo se asigna automáticamente (nunca lo escribe el
// usuario) derivado de la misma letra que ya identifica al tramo dentro de
// su calle -- no requiere una secuencia/tabla nueva: la unicidad de la letra
// por calle (ver migración 20260829110000) implica unicidad del código,
// además del `unique(street_id, code)` ya existente como respaldo.
export function segmentCodeForLetter(letter) {
  return `TR-${String(letter || "A").trim().toUpperCase()}`;
}

// Próxima letra libre para una calle: la primera (en orden alfabético/
// numérico) cuyo sort_order no esté ya usado por otro tramo de esa misma
// calle (excluyendo el propio tramo si se está editando).
export function nextAvailableSortOrder(existingSortOrders = [], excludeSortOrder = null) {
  const used = new Set(existingSortOrders.filter((value) => value !== excludeSortOrder));
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

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
