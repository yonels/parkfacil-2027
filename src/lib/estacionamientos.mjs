export const ESTACIONAMIENTO_TYPES = ["OFF_STREET", "ON_STREET"];
export const ESTACIONAMIENTO_STATES = ["DRAFT", "CONFIGURING", "READY_FOR_REVIEW", "ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"];

export const TYPE_LABELS = {
  OFF_STREET: "Off Street",
  ON_STREET: "On Street",
};

export const STATE_LABELS = {
  DRAFT: "Borrador",
  CONFIGURING: "En configuración",
  READY_FOR_REVIEW: "Listo para revisión",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  SUSPENDED: "Suspendido",
  CLOSED: "Cerrado",
};

export function normalizeParkingType(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ESTACIONAMIENTO_TYPES.includes(normalized) ? normalized : null;
}

export function normalizeParkingState(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return ESTACIONAMIENTO_STATES.includes(normalized) ? normalized : null;
}

export function calculateAvailable(capacity, occupied) {
  const total = Number(capacity) || 0;
  const used = Number(occupied) || 0;
  return Math.max(total - used, 0);
}

export function calculateOccupancyPercentage(capacity, occupied) {
  const total = Number(capacity) || 0;
  if (total <= 0) return 0;
  return Math.round((Math.max(Number(occupied) || 0, 0) / total) * 100);
}

export function getActiveSectors(sectors = []) {
  return sectors.filter((sector) => sector.status === "ACTIVE");
}

export function calculateParkingCapacity(sectors = []) {
  return getActiveSectors(sectors).reduce((sum, sector) => sum + Number(sector.capacity || 0), 0);
}

export function calculateParkingOccupied(sectors = []) {
  return getActiveSectors(sectors).reduce((sum, sector) => sum + Number(sector.occupied || 0), 0);
}

export function getParkingMetrics(parking) {
  const sectors = parking?.sectors || [];
  const capacity = calculateParkingCapacity(sectors);
  const occupied = calculateParkingOccupied(sectors);
  return {
    capacity,
    occupied,
    available: calculateAvailable(capacity, occupied),
    occupancyPercentage: calculateOccupancyPercentage(capacity, occupied),
    sectorCount: sectors.length,
    activeSectorCount: getActiveSectors(sectors).length,
  };
}

export function getSectorMetrics(sector) {
  const capacity = Number(sector?.capacity || 0);
  const occupied = Number(sector?.occupied || 0);
  return {
    capacity,
    occupied,
    available: calculateAvailable(capacity, occupied),
    occupancyPercentage: calculateOccupancyPercentage(capacity, occupied),
    visualizationMode: capacity <= 50 ? "units" : "summary",
  };
}

export function getSectorLocation(sector) {
  if (sector.type === "ON_STREET") {
    return [sector.street, sector.from && sector.to ? `${sector.from} → ${sector.to}` : sector.from || sector.to]
      .filter(Boolean)
      .join(" · ");
  }
  return [sector.level, sector.zone].filter(Boolean).join(" · ");
}

export function getIncompatibleSectors(parking, nextType) {
  return (parking?.sectors || []).filter((sector) => sector.type !== nextType);
}

export function canChangeParkingType(parking, nextType) {
  return getIncompatibleSectors(parking, nextType).length === 0;
}

export function validateParkingInput(input, existingParkings = [], currentId = null) {
  const errors = {};
  const required = ["code", "name", "companyId", "type", "status", "address", "city"];
  for (const field of required) {
    if (!String(input?.[field] ?? "").trim()) errors[field] = "Este campo es obligatorio.";
  }
  if (input?.type && !normalizeParkingType(input.type)) errors.type = "Selecciona un tipo válido.";
  if (input?.status && !normalizeParkingState(input.status)) errors.status = "Selecciona un estado válido.";
  if (input?.type === "OFF_STREET") {
    if (!Number.isInteger(Number(input?.accessCount)) || Number(input.accessCount) < 0) errors.accessCount = "Debe ser un entero igual o mayor que cero.";
    if (!Number.isInteger(Number(input?.exitCount)) || Number(input.exitCount) < 0) errors.exitCount = "Debe ser un entero igual o mayor que cero.";
  }
  const code = String(input?.code || "").trim().toUpperCase();
  if (code && existingParkings.some((item) => item.id !== currentId && item.code.toUpperCase() === code)) {
    errors.code = "Ya existe un estacionamiento con este código.";
  }
  return errors;
}

export function validateSectorInput(input, sectors = [], currentId = null) {
  const errors = {};
  for (const field of ["code", "name", "type", "status"]) {
    if (!String(input?.[field] ?? "").trim()) errors[field] = "Este campo es obligatorio.";
  }
  const capacity = Number(input?.capacity);
  const occupied = Number(input?.occupied);
  if (!Number.isInteger(capacity) || capacity <= 0) errors.capacity = "La capacidad debe ser un entero mayor que cero.";
  if (!Number.isInteger(occupied) || occupied < 0) errors.occupied = "Las ocupadas deben ser un entero igual o mayor que cero.";
  if (Number.isFinite(capacity) && Number.isFinite(occupied) && occupied > capacity) errors.occupied = "Las ocupadas no pueden superar la capacidad.";
  if (input?.type && !normalizeParkingType(input.type)) errors.type = "Selecciona un tipo válido.";
  if (input?.status && !normalizeParkingState(input.status)) errors.status = "Selecciona un estado válido.";
  const code = String(input?.code || "").trim().toUpperCase();
  if (code && sectors.some((item) => item.id !== currentId && item.code.toUpperCase() === code)) errors.code = "El código ya existe en este estacionamiento.";
  if (input?.type === "OFF_STREET") {
    if (!String(input?.level || "").trim()) errors.level = "El nivel es obligatorio para sectores Off Street.";
    if (!String(input?.zone || "").trim()) errors.zone = "La zona es obligatoria para sectores Off Street.";
  }
  if (input?.type === "ON_STREET") {
    if (!String(input?.street || "").trim()) errors.street = "La calle es obligatoria para sectores On Street.";
    if (!String(input?.from || "").trim()) errors.from = "El inicio del tramo es obligatorio.";
    if (!String(input?.to || "").trim()) errors.to = "El fin del tramo es obligatorio.";
  }
  return errors;
}

export function filterParkings(parkings, filters = {}) {
  const query = String(filters.search || "").trim().toLocaleLowerCase("es");
  return parkings.filter((parking) => {
    const searchable = [parking.code, parking.name, parking.address, parking.city, parking.companyName].join(" ").toLocaleLowerCase("es");
    return (!query || searchable.includes(query))
      && (!filters.status || filters.status === "ALL" || parking.status === filters.status)
      && (!filters.type || filters.type === "ALL" || parking.type === filters.type)
      && (!filters.companyId || filters.companyId === "ALL" || parking.companyId === filters.companyId);
  });
}

export function filterSectors(sectors, filters = {}) {
  const query = String(filters.search || "").trim().toLocaleLowerCase("es");
  return sectors.filter((sector) => {
    const searchable = [sector.code, sector.name, getSectorLocation(sector), sector.notes].join(" ").toLocaleLowerCase("es");
    return (!query || searchable.includes(query))
      && (!filters.status || filters.status === "ALL" || sector.status === filters.status)
      && (!filters.type || filters.type === "ALL" || sector.type === filters.type);
  });
}

export function sanitizeParkingInput(input = {}) {
  return {
    code: String(input.code || "").trim().toUpperCase(),
    name: String(input.name || "").trim(),
    companyId: String(input.companyId || "").trim(),
    companyName: String(input.companyName || "").trim(),
    type: normalizeParkingType(input.type),
    status: normalizeParkingState(input.status),
    address: String(input.address || "").trim(),
    city: String(input.city || "").trim(),
    country: String(input.country || "").trim(),
    schedule: String(input.schedule || "").trim(),
    description: String(input.description || "").trim(),
    accessCount: normalizeParkingType(input.type) === "OFF_STREET" ? Number(input.accessCount || 0) : 0,
    exitCount: normalizeParkingType(input.type) === "OFF_STREET" ? Number(input.exitCount || 0) : 0,
  };
}

export function classifyParkingPersistenceError(error) {
  if (error?.name === "SupabaseConfigurationError") return { code: "SUPABASE_NOT_CONFIGURED", message: "Supabase no está configurado para guardar estacionamientos.", status: 503 };
  if (["42P01", "PGRST205"].includes(error?.code)) return { code: "PARKINGS_TABLE_NOT_FOUND", message: "La estructura de estacionamientos aún no está creada en Supabase.", status: 503 };
  if (error?.code === "23505") return { code: "DUPLICATE_CODE", message: "No fue posible guardar porque el código ya existe.", status: 409 };
  if (error?.code === "23514") return { code: "CAPACITY_CONSTRAINT", message: "La capacidad ocupada no puede superar la capacidad total.", status: 400 };
  return { code: "PARKING_UPDATE_FAILED", message: "No fue posible guardar el estacionamiento.", status: 500 };
}

export function sanitizeSectorInput(input = {}) {
  return {
    code: String(input.code || "").trim().toUpperCase(),
    name: String(input.name || "").trim(),
    type: normalizeParkingType(input.type),
    status: normalizeParkingState(input.status),
    capacity: Number(input.capacity || 0),
    occupied: Number(input.occupied || 0),
    notes: String(input.notes || "").trim(),
    level: String(input.level || "").trim(),
    zone: String(input.zone || "").trim(),
    locationDescription: String(input.locationDescription || "").trim(),
    accessCount: Number(input.accessCount || 0),
    exitCount: Number(input.exitCount || 0),
    street: String(input.street || "").trim(),
    from: String(input.from || "").trim(),
    to: String(input.to || "").trim(),
    district: String(input.district || "").trim(),
    segmentDescription: String(input.segmentDescription || "").trim(),
  };
}
