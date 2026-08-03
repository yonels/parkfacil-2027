const PLATE_PATTERN = /^[A-Z0-9]{4,8}$/;
export const MOVEMENT_TYPES = ["ENTRY", "EXIT"];
export const ENTRY_SOURCES = ["MOBILE", "POS", "TABLET", "DESKTOP", "OTHER"];

export function normalizePlate(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function joinChileanPlate(prefix, suffix) {
  const first = normalizePlate(prefix).slice(0, 4);
  const last = normalizePlate(suffix).slice(0, 2);
  return first.length === 4 && last.length === 2 ? `${first}-${last}` : "";
}

export function splitChileanPlate(value) {
  const normalized = normalizePlate(value);
  return { prefix: normalized.slice(0, 4), suffix: normalized.slice(4, 6) };
}

export function calculateChileTax(netAmount, taxRate = 0.19) {
  const net = Math.max(0, Math.round(Number(netAmount) || 0));
  const tax = Math.round(net * taxRate);
  return { net, tax, total: net + tax, taxRate };
}

export function detectDeviceSource(userAgent = "") {
  const value = String(userAgent).toLowerCase();
  if (/android/.test(value) && /mobile/.test(value)) return "POS";
  if (/iphone|mobile/.test(value)) return "MOBILE";
  if (/ipad|tablet/.test(value)) return "TABLET";
  return "DESKTOP";
}

export function sanitizeMovementInput(input = {}) {
  return {
    movementType: String(input.movementType ?? "").toUpperCase(),
    plate: normalizePlate(input.plate),
    parkingId: String(input.parkingId ?? "").trim(),
    accessPoint: String(input.accessPoint ?? "").trim().slice(0, 80),
    source: String(input.source ?? "OTHER").toUpperCase(),
    notes: String(input.notes ?? "").trim().slice(0, 500),
    clientRequestId: String(input.clientRequestId ?? "").trim(),
  };
}

export function validateMovementInput(input) {
  const errors = {};
  if (!MOVEMENT_TYPES.includes(input.movementType)) errors.movementType = "Selecciona ingreso o salida.";
  if (!PLATE_PATTERN.test(input.plate)) errors.plate = "Ingresa una patente válida de 4 a 8 caracteres.";
  if (!input.parkingId) errors.parkingId = "Selecciona un estacionamiento.";
  if (!input.accessPoint) errors.accessPoint = "Indica el acceso utilizado.";
  if (!ENTRY_SOURCES.includes(input.source)) errors.source = "El origen del dispositivo no es válido.";
  return errors;
}

export function movementLabel(type) {
  return type === "ENTRY" ? "Ingreso" : "Salida";
}
