import { calculateScheduledParkingCharge } from "./parkingRates.mjs";

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

export function formatChileanPlate(value) {
  const normalized = normalizePlate(value);
  return normalized.length === 6 ? `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}` : "";
}

export function splitChileanPlate(value) {
  const normalized = normalizePlate(value);
  return { prefix: normalized.slice(0, 4), suffix: normalized.slice(4, 6) };
}

export function splitChileTaxFromTotal(totalAmount, taxRate = 0.19) {
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  const net = Math.round(total / (1 + taxRate));
  const tax = total - net;
  return { net, tax, total, taxRate };
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

// Decide si una estadía puede cotizarse con la tarifa vigente. "No hay tarifa activa" y
// "la tarifa requiere revisión" son desenlaces operacionales normales de cotizar una
// estadía, no fallas del vehículo/ticket — por eso esta función nunca lanza: devuelve
// { blocked, reason, elapsedSeconds, elapsedMinutes, charge? } con la permanencia ya
// calculada, para que el llamador (API de Data Entry) siga mostrando el vehículo, el
// ticket y la permanencia aunque el cálculo/cobro quede bloqueado.
export function resolveStayQuoteAvailability(rate, entryAt, now = new Date()) {
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(entryAt).getTime()) / 1000));
  const elapsedMinutes = Math.max(0, Math.floor(elapsedSeconds / 60));
  if (!rate) return { blocked: true, reason: "ACTIVE_RATE_NOT_FOUND", elapsedSeconds, elapsedMinutes };
  const charge = calculateScheduledParkingCharge(rate, entryAt, now);
  if (!charge.valid || charge.requiresDailyPolicy) return { blocked: true, reason: "RATE_REQUIRES_REVIEW", elapsedSeconds, elapsedMinutes, charge };
  return { blocked: false, elapsedSeconds, elapsedMinutes, charge };
}
