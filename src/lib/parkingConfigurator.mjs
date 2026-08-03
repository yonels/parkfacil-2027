export const CONFIGURATION_STATES = ["DRAFT", "CONFIGURING", "READY_FOR_REVIEW", "ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"];

export const CONFIGURATION_STATE_LABELS = {
  DRAFT: "Borrador",
  CONFIGURING: "En configuración",
  READY_FOR_REVIEW: "Listo para revisión",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  SUSPENDED: "Suspendido",
  CLOSED: "Cerrado",
};

export const STEP_STATES = {
  NOT_STARTED: "NO_INICIADO",
  IN_PROGRESS: "EN_PROCESO",
  COMPLETED: "COMPLETADO",
  BLOCKED: "BLOQUEADO",
  NOT_APPLICABLE: "NO_APLICA",
};

const definition = {
  OFF_STREET: [
    ["general", "Datos generales"],
    ["levels", "Niveles"],
    ["zones", "Zonas"],
    ["capacity", "Capacidad por zona"],
    ["accesses", "Accesos y salidas"],
    ["barriers", "Barreras"],
    ["cameras", "Cámaras"],
    ["rates", "Tarifas"],
    ["operators", "Operadores y turnos"],
    ["review", "Revisión y activación"],
  ],
  ON_STREET: [
    ["general", "Datos generales"],
    ["sectors", "Áreas operacionales"],
    ["streets", "Calles"],
    ["segments", "Tramos configurables"],
    ["capacity", "Capacidad en plazas"],
    ["operators", "Operadores"],
    ["assignments", "Asignaciones"],
    ["rates", "Tarifas y horarios"],
    ["shifts", "Turnos"],
    ["closures", "Cierre de turno"],
    ["review", "Revisión y activación"],
  ],
};

const completeGeneral = (parking) => ["name", "companyId", "type", "address", "city"].every((field) => String(parking?.[field] || "").trim());
const stateForCount = (count) => count > 0 ? STEP_STATES.COMPLETED : STEP_STATES.NOT_STARTED;
const blocked = (label) => ({ status: STEP_STATES.BLOCKED, detail: label });

export function buildConfigurator(parking, summary, availability = {}) {
  const offStreet = parking.type === "OFF_STREET";
  const values = {
    general: completeGeneral(parking) ? { status: STEP_STATES.COMPLETED, detail: "Datos obligatorios completos" } : { status: STEP_STATES.IN_PROGRESS, detail: "Faltan datos obligatorios" },
    levels: { status: stateForCount(summary.levelCount), detail: `${summary.levelCount} configurados` },
    zones: { status: stateForCount(summary.zoneCount), detail: `${summary.zoneCount} configuradas` },
    sectors: { status: stateForCount(summary.sectorCount), detail: `${summary.sectorCount} configurados` },
    streets: { status: stateForCount(summary.streetCount), detail: `${summary.streetCount} configuradas` },
    segments: { status: stateForCount(summary.segmentCount), detail: `${summary.segmentCount} configurados` },
    capacity: { status: summary.capacity > 0 ? STEP_STATES.COMPLETED : STEP_STATES.IN_PROGRESS, detail: `${summary.capacity} plazas` },
    assignments: { status: stateForCount(summary.assignmentCount), detail: `${summary.assignmentCount} asignaciones` },
    operators: availability.operators ? { status: stateForCount(summary.assignmentCount), detail: `${summary.assignmentCount} asignaciones` } : blocked("Fuente de operadores pendiente"),
    shifts: availability.shifts ? { status: stateForCount(summary.shiftCount), detail: `${summary.shiftCount} turnos` } : blocked("Estructura de turnos pendiente"),
    closures: availability.closures ? { status: STEP_STATES.IN_PROGRESS, detail: `${summary.pendingClosureCount || 0} cierres pendientes` } : blocked("Fuente operacional pendiente"),
    accesses: blocked("Persistencia de accesos pendiente"),
    barriers: blocked("Persistencia de barreras pendiente"),
    cameras: blocked("Persistencia de cámaras pendiente"),
    rates: blocked("Persistencia de tarifas pendiente"),
  };
  const requirements = activationRequirements(parking, summary, availability);
  values.review = requirements.length ? { status: STEP_STATES.BLOCKED, detail: `${requirements.length} requisitos pendientes` } : { status: STEP_STATES.COMPLETED, detail: "Listo para activar" };
  const steps = definition[parking.type].map(([key, label]) => ({ key, label, ...values[key] }));
  const completed = steps.filter((step) => step.status === STEP_STATES.COMPLETED).length;
  return {
    parking,
    type: parking.type,
    summary,
    steps,
    progress: Math.round((completed / steps.length) * 100),
    activation: { allowed: requirements.length === 0, requirements },
    structureRoute: `/estacionamientos/${parking.code}/${offStreet ? "niveles" : "sectores"}`,
  };
}

export function activationRequirements(parking, summary, availability = {}) {
  const missing = [];
  if (!completeGeneral(parking)) missing.push("Completar los datos generales.");
  if (parking.type === "OFF_STREET") {
    if (summary.levelCount < 1) missing.push("Crear al menos un nivel.");
    if (summary.zoneCount < 1) missing.push("Crear al menos una zona.");
  } else {
    if (summary.sectorCount < 1) missing.push("Crear al menos un área operacional.");
    if (summary.streetCount < 1) missing.push("Crear al menos una calle.");
    if (summary.segmentCount < 1) missing.push("Crear al menos un tramo configurable.");
  }
  if (summary.capacity <= 0) missing.push("Configurar una capacidad total mayor que cero.");
  if (!availability.rates) missing.push("La fuente persistente de tarifas aún no está disponible.");
  else if (summary.rateCount < 1) missing.push("Configurar al menos una tarifa válida.");
  return missing;
}

export function sanitizeTypeChange(input = {}) {
  return {
    type: ["ON_STREET", "OFF_STREET"].includes(input.type) ? input.type : null,
    confirmed: input.confirmed === true,
    reason: String(input.reason || "").trim().slice(0, 500),
  };
}

export function incompatibleRoute(type, section) {
  return (type === "OFF_STREET" && ["sectores", "calles", "asignaciones-on-street"].includes(section))
    || (type === "ON_STREET" && ["niveles", "zonas", "barreras"].includes(section));
}
