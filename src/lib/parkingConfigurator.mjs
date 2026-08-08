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
const completeCompany = (parking) => Boolean(String(parking?.companyId || "").trim());
const stateForCount = (count) => count > 0 ? STEP_STATES.COMPLETED : STEP_STATES.NOT_STARTED;
const blocked = (label) => ({ status: STEP_STATES.BLOCKED, detail: label });

function activationChecklist(parking, summary, availability = {}) {
  const offStreet = parking.type === "OFF_STREET";
  const structureComplete = offStreet
    ? summary.levelCount > 0 && summary.zoneCount > 0
    : summary.sectorCount > 0 && summary.streetCount > 0 && summary.segmentCount > 0;

  return [
    {
      key: "general",
      label: "Datos generales",
      status: completeGeneral(parking) ? STEP_STATES.COMPLETED : STEP_STATES.IN_PROGRESS,
      detail: completeGeneral(parking) ? "Datos obligatorios completos" : "Faltan datos obligatorios",
      required: true,
      requirements: completeGeneral(parking) ? [] : ["Completar los datos generales."],
    },
    {
      key: "company",
      label: "Empresa asociada",
      status: completeCompany(parking) ? STEP_STATES.COMPLETED : STEP_STATES.IN_PROGRESS,
      detail: parking.companyName || "Sin empresa asociada",
      required: false,
      requirements: [],
    },
    {
      key: "structure",
      label: "Estructura operacional",
      status: structureComplete ? STEP_STATES.COMPLETED : STEP_STATES.IN_PROGRESS,
      detail: offStreet
        ? `${summary.levelCount} niveles · ${summary.zoneCount} zonas`
        : `${summary.sectorCount} áreas · ${summary.streetCount} calles · ${summary.segmentCount} tramos`,
      required: true,
      requirements: offStreet
        ? [
            ...(summary.levelCount < 1 ? ["Crear al menos un nivel."] : []),
            ...(summary.zoneCount < 1 ? ["Crear al menos una zona."] : []),
          ]
        : [
            ...(summary.sectorCount < 1 ? ["Crear al menos un área operacional."] : []),
            ...(summary.streetCount < 1 ? ["Crear al menos una calle."] : []),
            ...(summary.segmentCount < 1 ? ["Crear al menos un tramo configurable."] : []),
          ],
    },
    {
      key: "capacity",
      label: "Capacidad",
      status: summary.capacity > 0 ? STEP_STATES.COMPLETED : STEP_STATES.IN_PROGRESS,
      detail: `${summary.capacity} plazas`,
      required: true,
      requirements: summary.capacity > 0 ? [] : ["Configurar una capacidad total mayor que cero."],
    },
    {
      key: "rates",
      label: "Tarifa configurada",
      status: !availability.rates
        ? STEP_STATES.BLOCKED
        : summary.rateCount > 0
          ? STEP_STATES.COMPLETED
          : STEP_STATES.IN_PROGRESS,
      detail: !availability.rates
        ? "La fuente persistente de tarifas aún no está disponible."
        : summary.rateCount > 0
          ? `${summary.rateCount} tarifas activas`
          : "Falta configurar una tarifa activa",
      required: true,
      requirements: !availability.rates
        ? ["La fuente persistente de tarifas aún no está disponible."]
        : summary.rateCount > 0
          ? []
          : ["Configurar al menos una tarifa válida."],
    },
    {
      key: "operators",
      label: "Operadores",
      status: parking.type === "ON_STREET"
        ? (availability.operators ? (summary.assignmentCount > 0 ? STEP_STATES.COMPLETED : STEP_STATES.IN_PROGRESS) : STEP_STATES.BLOCKED)
        : STEP_STATES.NOT_APPLICABLE,
      detail: parking.type === "ON_STREET"
        ? (availability.operators ? `${summary.assignmentCount} asignaciones` : "Fuente de operadores pendiente")
        : "No aplica para este tipo",
      required: false,
      requirements: [],
    },
    {
      key: "devices",
      label: "Dispositivos",
      status: STEP_STATES.NOT_APPLICABLE,
      detail: "No aplica en esta etapa",
      required: false,
      requirements: [],
    },
  ];
}

function requiredActivationMessages(checklist) {
  return checklist.flatMap((item) => item.required ? item.requirements : []).filter(Boolean);
}

export function buildConfigurator(parking, summary, availability = {}) {
  const offStreet = parking.type === "OFF_STREET";
  const checklist = activationChecklist(parking, summary, availability);
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
  const requirements = activationRequirements(parking, summary, availability, checklist);
  values.review = requirements.length ? { status: STEP_STATES.BLOCKED, detail: `${requirements.length} requisitos pendientes` } : { status: STEP_STATES.COMPLETED, detail: "Listo para activar" };
  const steps = definition[parking.type].map(([key, label]) => ({ key, label, ...values[key] }));
  const completed = steps.filter((step) => step.status === STEP_STATES.COMPLETED).length;
  return {
    parking,
    type: parking.type,
    isActive: parking.status === "ACTIVE",
    summary,
    steps,
    progress: Math.round((completed / steps.length) * 100),
    activation: { allowed: requirements.length === 0, requirements, checklist },
    structureRoute: `/estacionamientos/${parking.code}/${offStreet ? "niveles" : "sectores"}`,
    reviewRoute: `/estacionamientos/${parking.code}/configuracion/revision`,
  };
}

export function activationRequirements(parking, summary, availability = {}, checklist = null) {
  const currentChecklist = checklist || activationChecklist(parking, summary, availability);
  return requiredActivationMessages(currentChecklist);
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
