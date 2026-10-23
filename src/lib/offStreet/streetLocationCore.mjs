// Ubicación en calle de un ingreso Off Street (SOL-2026-10-23-001, etapa 3).
// Reglas puras, sin base de datos: asignaciones vigentes del operador, tramo
// sugerido, validación del tramo y número elegidos, y marca «fuera de asignación».
//
// days_of_week usa ISO (1 = lunes … 7 = domingo); las horas se comparan en la hora
// operacional de Chile. El operador PUEDE ingresar fuera de su asignación (decisión
// del usuario): no se bloquea, se marca. El cupo lo controla la base de datos
// (trigger parking_stays_validate_street_location, error STREET_SEGMENT_FULL).

export const STREET_LOCATION_TIME_ZONE = "America/Santiago";

// Fecha (YYYY-MM-DD), hora (HH:MM) y día ISO en Chile para un instante.
export function operationalClock(now = new Date(), timeZone = STREET_LOCATION_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const isoDay = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}`, isoDay };
}

const hhmm = (value) => String(value ?? "").slice(0, 5);

// ¿La asignación rige en este momento? (estado, vigencia, día y horario).
export function assignmentIsActiveAt(assignment, clock) {
  if (!assignment || assignment.status !== "ACTIVE") return false;
  if (assignment.valid_from && clock.date < String(assignment.valid_from).slice(0, 10)) return false;
  if (assignment.valid_until && clock.date > String(assignment.valid_until).slice(0, 10)) return false;
  const days = Array.isArray(assignment.days_of_week) ? assignment.days_of_week.map(Number) : [];
  if (days.length && !days.includes(clock.isoDay)) return false;
  const start = hhmm(assignment.start_time);
  const end = hhmm(assignment.end_time);
  if (start && end && (clock.time < start || clock.time > end)) return false;
  return true;
}

// Asignaciones del operador que rigen ahora.
export function activeOperatorAssignments(assignments, operatorId, clock) {
  return (assignments || []).filter((item) => String(item.operator_id) === String(operatorId) && assignmentIsActiveAt(item, clock));
}

const rangesOverlap = (aFrom, aTo, bFrom, bTo) => Number(aFrom) <= Number(bTo) && Number(bFrom) <= Number(aTo);

// ¿La asignación cubre este tramo (y número, si se informó)?
export function assignmentCoversSegment(assignment, segment, streetNumber = null) {
  if (!assignment || !segment || String(assignment.street_id) !== String(segment.street_id)) return false;
  if (Number.isInteger(streetNumber)) return streetNumber >= Number(assignment.number_from) && streetNumber <= Number(assignment.number_to);
  return rangesOverlap(assignment.number_from, assignment.number_to, segment.from_number, segment.to_number);
}

// Tramos que cubren las asignaciones vigentes del operador, en orden.
export function assignedSegmentIds(segments, activeAssignments) {
  return (segments || []).filter((segment) => (activeAssignments || []).some((assignment) => assignmentCoversSegment(assignment, segment))).map((segment) => segment.id);
}

// Número de calle opcional: entero >= 0, o null si viene vacío.
export function parseStreetNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return { value: null };
  const number = Number(String(value).trim());
  if (!Number.isInteger(number) || number < 0) return { error: "STREET_NUMBER_INVALID" };
  return { value: number };
}

// Resuelve la ubicación de un ingreso. Sin segmentId: ingreso de recinto (sin
// calle), permitido porque un estacionamiento puede mezclar recinto y calles.
export function resolveEntryStreetLocation({ segments, activeAssignments, segmentId, streetNumber }) {
  if (!segmentId) {
    if (streetNumber !== null && streetNumber !== undefined && String(streetNumber).trim() !== "") return { error: "STAY_STREET_SEGMENT_REQUIRED" };
    return { location: null };
  }
  const segment = (segments || []).find((item) => String(item.id) === String(segmentId));
  if (!segment) return { error: "STREET_SEGMENT_NOT_FOUND" };
  if (segment.status && segment.status !== "ACTIVE") return { error: "STREET_SEGMENT_NOT_ACTIVE" };
  const parsed = parseStreetNumber(streetNumber);
  if (parsed.error) return { error: parsed.error };
  if (parsed.value !== null && (parsed.value < Number(segment.from_number) || parsed.value > Number(segment.to_number))) return { error: "STAY_STREET_NUMBER_OUT_OF_SEGMENT" };
  const covered = (activeAssignments || []).some((assignment) => assignmentCoversSegment(assignment, segment, parsed.value));
  return { location: { segment_id: segment.id, street_id: segment.street_id, sector_id: segment.area_id, street_number: parsed.value, out_of_assignment: !covered } };
}

export const STREET_LOCATION_ERRORS = Object.freeze({
  STREET_SEGMENT_FULL: { status: 409, message: "El tramo está lleno. Elige otro tramo." },
  STREET_SEGMENT_NOT_ACTIVE: { status: 409, message: "El tramo no está activo." },
  STREET_SEGMENT_NOT_FOUND: { status: 400, message: "El tramo elegido no pertenece a este estacionamiento." },
  STAY_STREET_NUMBER_OUT_OF_SEGMENT: { status: 400, message: "El número no está dentro del tramo elegido." },
  STAY_STREET_SEGMENT_REQUIRED: { status: 400, message: "Elige el tramo para informar el número de calle." },
  STREET_NUMBER_INVALID: { status: 400, message: "El número de calle no es válido." },
  STAY_STREET_SEGMENT_MISMATCH: { status: 400, message: "El tramo elegido no corresponde a su calle o zona." },
});

// Código de error de ubicación desde un error de Postgres (trigger) o de la lógica.
export function streetLocationErrorCode(error) {
  const message = String(error?.message || error || "");
  return Object.keys(STREET_LOCATION_ERRORS).find((code) => message.includes(code)) || null;
}

// Tramo propuesto al abrir un ingreso: el asignado al operador con cupo; si no hay
// ninguno con cupo, ninguno (recinto). Nunca se propone un tramo lleno.
export function defaultStreetSegmentId(streetLocation) {
  const segments = streetLocation?.enabled ? streetLocation.segments || [] : [];
  const preferred = segments.find((item) => item.id === streetLocation?.defaultSegmentId && item.available > 0);
  return (preferred || segments.find((item) => item.assigned && item.available > 0))?.id || "";
}

// Vista para el POS: tramos con zona, calle, rango, cupo y si están asignados al operador.
export function posStreetSegmentsView({ sectors, streets, segments, occupancy, assignedIds }) {
  const sectorById = new Map((sectors || []).map((item) => [String(item.id), item]));
  const streetById = new Map((streets || []).map((item) => [String(item.id), item]));
  const assigned = new Set((assignedIds || []).map(String));
  return (segments || []).filter((segment) => segment.status === "ACTIVE").map((segment) => {
    const occupied = Number(occupancy?.[segment.id] || 0);
    const capacity = Number(segment.capacity || 0);
    return {
      id: segment.id,
      code: segment.code,
      name: segment.name,
      zoneName: sectorById.get(String(segment.area_id))?.name || "",
      streetName: streetById.get(String(segment.street_id))?.name || "",
      fromNumber: segment.from_number,
      toNumber: segment.to_number,
      capacity,
      occupied,
      available: Math.max(capacity - occupied, 0),
      assigned: assigned.has(String(segment.id)),
    };
  }).sort((a, b) => Number(b.assigned) - Number(a.assigned) || a.zoneName.localeCompare(b.zoneName) || a.streetName.localeCompare(b.streetName) || Number(a.fromNumber) - Number(b.fromNumber));
}
