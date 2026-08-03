export const OPERATIONAL_STATES = ["ACTIVE", "INACTIVE", "MAINTENANCE"];
export const SHIFT_STATES = ["PROGRAMMED", "OPEN", "CLOSING", "CLOSED", "CANCELLED"];

const text = (value) => String(value ?? "").trim();
const integer = (value) => Number(value);
const active = (item) => item?.status === "ACTIVE";

export function calculateCapacity(items = []) {
  return items.filter(active).reduce((total, item) => total + Number(item.capacity || 0), 0);
}

export function calculateOccupied(items = []) {
  return items.filter(active).reduce((total, item) => total + Number(item.occupied || 0), 0);
}

export function capacityMetrics(items = []) {
  const capacity = calculateCapacity(items);
  const occupied = calculateOccupied(items);
  return {
    capacity,
    occupied,
    available: Math.max(capacity - occupied, 0),
    occupancyPercentage: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
  };
}

export function normalizeSectorCode(value) {
  return text(value).toUpperCase();
}

export function sectorDisplayName(sector) {
  const code = normalizeSectorCode(sector?.code);
  return `Área ${code}${text(sector?.name) ? ` - ${text(sector.name)}` : ""}`;
}

export function validateOnStreetSector(input, sectors = [], currentId = null) {
  const errors = {};
  const code = normalizeSectorCode(input?.code);
  if (!/^[A-Z]{1,10}$/.test(code)) errors.code = "El código del área debe contener entre 1 y 10 letras.";
  if (!text(input?.name)) errors.name = "El nombre es obligatorio.";
  if (!OPERATIONAL_STATES.includes(input?.status)) errors.status = "Selecciona un estado válido.";
  if (sectors.some((item) => item.id !== currentId && normalizeSectorCode(item.code) === code)) {
    errors.code = "El código ya existe en este estacionamiento.";
  }
  return errors;
}

export function validateStreet(input, streets = [], currentId = null) {
  const errors = {};
  const capacity = integer(input?.capacity);
  const occupied = integer(input?.occupied);
  if (!text(input?.name)) errors.name = "El nombre de la calle es obligatorio.";
  if (!Number.isInteger(capacity) || capacity <= 0) errors.capacity = "La capacidad debe ser un entero mayor que cero.";
  if (!Number.isInteger(occupied) || occupied < 0) errors.occupied = "Las ocupadas deben ser un entero igual o mayor que cero.";
  if (Number.isInteger(capacity) && Number.isInteger(occupied) && occupied > capacity) {
    errors.occupied = "Las ocupadas no pueden superar la capacidad.";
  }
  if (!OPERATIONAL_STATES.includes(input?.status)) errors.status = "Selecciona un estado válido.";
  const name = text(input?.name).toLocaleLowerCase("es");
  if (name && streets.some((item) => item.id !== currentId && text(item.name).toLocaleLowerCase("es") === name)) {
    errors.name = "La calle ya existe en este sector.";
  }
  return errors;
}

export function validateLevel(input, levels = [], currentId = null) {
  const errors = {};
  if (!text(input?.code)) errors.code = "El código es obligatorio.";
  if (!text(input?.name)) errors.name = "El nombre es obligatorio.";
  if (!OPERATIONAL_STATES.includes(input?.status)) errors.status = "Selecciona un estado válido.";
  const code = text(input?.code).toUpperCase();
  if (levels.some((item) => item.id !== currentId && text(item.code).toUpperCase() === code)) {
    errors.code = "El código ya existe en este estacionamiento.";
  }
  return errors;
}

export function sanitizeLevelCreateInput(input = {}) {
  return {
    name: text(input.name),
    status: input.status,
    description: text(input.description).slice(0, 500),
    capacity: Number(input.capacity),
  };
}

export function validateLevelCreateInput(input) {
  const errors = {};
  if (!text(input?.name)) errors.name = "El nombre es obligatorio.";
  else if (text(input.name).length > 120) errors.name = "El nombre no puede superar 120 caracteres.";
  if (!OPERATIONAL_STATES.includes(input?.status)) errors.status = "Selecciona un estado válido.";
  if (text(input?.description).length > 500) errors.description = "La descripción no puede superar 500 caracteres.";
  if (!Number.isInteger(input?.capacity) || input.capacity < 0) errors.capacity = "La cantidad de plazas debe ser un entero igual o mayor que cero.";
  return errors;
}

export function validateZone(input, zones = [], currentId = null) {
  const errors = validateStreet(input, zones, currentId);
  if (!text(input?.code)) errors.code = "El código es obligatorio.";
  return errors;
}

function minutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(text(value));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function assignmentsOverlap(a, b) {
  const sharedDay = (a.daysOfWeek || []).some((day) => (b.daysOfWeek || []).includes(day));
  const startA = minutes(a.startTime);
  const endA = minutes(a.endTime);
  const startB = minutes(b.startTime);
  const endB = minutes(b.endTime);
  return sharedDay && [startA, endA, startB, endB].every(Number.isFinite)
    && rangesOverlap(startA, endA, startB, endB);
}

export function validateOperatorAssignment(input, street, assignments = [], currentId = null) {
  const errors = {};
  const from = integer(input?.numberFrom);
  const to = integer(input?.numberTo);
  const maximum = integer(input?.maxVehicles);
  if (!text(input?.operatorId)) errors.operatorId = "Selecciona un operador.";
  if (!Number.isInteger(from)) errors.numberFrom = "Ingresa un número inicial.";
  if (!Number.isInteger(to)) errors.numberTo = "Ingresa un número final.";
  if (Number.isInteger(from) && Number.isInteger(to) && from >= to) errors.numberTo = "El número final debe ser mayor que el inicial.";
  if (!Number.isInteger(maximum) || maximum <= 0) errors.maxVehicles = "El máximo debe ser un entero mayor que cero.";
  if (Number.isInteger(maximum) && maximum > Number(street?.capacity || 0)) errors.maxVehicles = "El máximo no puede superar la capacidad física de la calle.";
  if (!text(input?.startTime)) errors.startTime = "La hora de inicio es obligatoria.";
  if (!text(input?.endTime)) errors.endTime = "La hora de término es obligatoria.";
  const concurrent = assignments.filter((item) => item.id !== currentId && item.status === "ACTIVE" && assignmentsOverlap(item, input));
  if (concurrent.some((item) => item.operatorId === input.operatorId)) errors.operatorId = "El operador ya tiene una asignación simultánea.";
  const used = concurrent.reduce((sum, item) => sum + Number(item.maxVehicles || 0), 0);
  if (Number.isInteger(maximum) && used + maximum > Number(street?.capacity || 0)) {
    errors.maxVehicles = "La suma de máximos simultáneos supera la capacidad de la calle.";
  }
  return errors;
}

export function canOpenShift(shifts, operatorId) {
  return !shifts.some((shift) => shift.operatorId === operatorId && ["OPEN", "CLOSING"].includes(shift.status));
}

export function canCloseShift(shift) {
  return shift?.status === "OPEN" || shift?.status === "CLOSING";
}

export function calculateCollectedAmount(closure = {}) {
  return Number(closure.collectedOwnVehicles || 0) + Number(closure.collectedReceivedVehicles || 0);
}

export function buildCapacityVisualization(capacity, occupied) {
  const total = Math.max(Number(capacity) || 0, 0);
  const used = Math.min(Math.max(Number(occupied) || 0, 0), total);
  return {
    mode: total <= 50 ? "units" : "summary",
    occupied: used,
    available: total - used,
    capacity: total,
    indicators: total <= 50
      ? Array.from({ length: total }, (_, index) => ({ state: index < used ? "occupied" : "available" }))
      : [],
    representsPhysicalPositions: false,
    plateAssociation: null,
  };
}

export function sanitizeOnStreetSector(input = {}) {
  return { code: normalizeSectorCode(input.code), name: text(input.name), status: input.status, description: text(input.description), notes: text(input.notes) };
}

export function sanitizeCapacityEntity(input = {}) {
  return { code: text(input.code).toUpperCase(), name: text(input.name), status: input.status, capacity: integer(input.capacity), occupied: integer(input.occupied), district: text(input.district), description: text(input.description), notes: text(input.notes) };
}
