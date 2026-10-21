// Valida y normaliza los formularios de creación/edición de ubicaciones QR
// del módulo On Street QR (producto definitivo, con Webpay). Puro, sin acceso
// a base de datos — la pertenencia a la empresa y la consistencia de la
// jerarquía área/calle/tramo/estacionamiento se validan aparte, en el
// servidor (onStreetAdminRepository.js), nunca confiando en lo que llega del
// cliente.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ON_STREET_QR_STATUS_VALUES = Object.freeze(["ACTIVE", "INACTIVE"]);

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ""));
}

export function buildOnStreetQrLocationCreate(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const errors = [];

  if (!isUuid(source.parkingId)) errors.push("Selecciona un estacionamiento válido.");
  if (!isUuid(source.sectorId)) errors.push("Selecciona un área válida.");
  if (!isUuid(source.streetId)) errors.push("Selecciona una calle válida.");
  if (!isUuid(source.segmentId)) errors.push("Selecciona un tramo válido.");
  // Decisión funcional "Proyectos On Street" (2026-08-29): cada Ubicación QR
  // debe tener asignada una tarifa CONCRETA, elegida explícitamente por
  // quien crea el QR -- nunca resuelta automáticamente (última/más
  // reciente/"activa genérica"). Por eso rateId es obligatorio aquí, con la
  // misma validación de forma que el resto de los IDs; la pertenencia real
  // al estacionamiento se revalida en el servidor (onStreetAdminRepository.js).
  if (!isUuid(source.rateId)) errors.push("Selecciona una tarifa para esta ubicación.");

  const label = String(source.label || "").trim();
  if (!label) errors.push("Ingresa un nombre o descripción para la ubicación.");

  const status = ON_STREET_QR_STATUS_VALUES.includes(source.status) ? source.status : null;
  if (!status) errors.push("Selecciona un estado inicial válido.");

  if (errors.length) return { errors, data: null };
  return {
    errors: [],
    data: { parkingId: source.parkingId, sectorId: source.sectorId, streetId: source.streetId, segmentId: source.segmentId, rateId: source.rateId, label, status },
  };
}

export function buildOnStreetQrLocationUpdate(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const errors = [];
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(source, "label")) {
    const label = String(source.label || "").trim();
    if (!label) errors.push("El nombre o descripción no puede estar vacío.");
    else patch.label = label;
  }

  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    if (!ON_STREET_QR_STATUS_VALUES.includes(source.status)) errors.push("Estado inválido.");
    else patch.status = source.status;
  }

  return { errors, patch };
}
