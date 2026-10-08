import { validateOperationalRate } from "./parkingRates.mjs";
import { parseMinuteOfDay } from "./parkingTimeBands.mjs";

function optionalAmount(value) {
  return value === "" || value == null ? null : Number(value);
}

// Franjas horarias desde el formulario: horas "HH:MM" -> minutos del día. Una
// hora inválida queda como NaN y la rechaza validateTimeBandSets.
function sanitizeBandSets(rawSets) {
  if (!Array.isArray(rawSets)) return [];
  return rawSets.slice(0, 7).map((set) => ({
    label: String(set?.label || "").trim().slice(0, 60),
    daysOfWeek: [...new Set((Array.isArray(set?.daysOfWeek) ? set.daysOfWeek : []).map(Number))].sort((a, b) => a - b),
    appliesToHolidays: set?.appliesToHolidays === true,
    bands: (Array.isArray(set?.bands) ? set.bands : []).slice(0, 9).map((band) => ({
      label: String(band?.label || "").trim().slice(0, 40),
      startMinute: parseMinuteOfDay(band?.start) ?? Number.NaN,
      endMinute: parseMinuteOfDay(band?.end) ?? Number.NaN,
      minuteAmount: Number(band?.minuteAmount),
      capAmount: optionalAmount(band?.capAmount),
    })),
  }));
}

// Capa de entrada de la API de tarifas: convierte el body HTTP al formato de dominio y
// aplica validate(). Vive fuera de route.js (que importa "next/server") para poder
// probarla con node:test sin depender del runtime de Next.
//
// Nunca se aceptan campos de "estadía nocturna" (regularStartTime/regularEndTime/
// overnightEndTime) desde el cliente: ese modelo quedó retirado del motor legal (ver
// docs/MOTOR-TARIFARIO-LEGAL.md). overnightFlatAmount solo se procesa para poder
// rechazar explícitamente cualquier valor distinto de cero, nunca para guardarlo.
export function sanitizeRateInput(input = {}) {
  const billingMode = ["EFFECTIVE_MINUTE", "EXPIRED_BLOCKS"].includes(input.billingMode) ? input.billingMode : null;
  const timeBandsEnabled = input.timeBandsEnabled === true;
  return {
    name: String(input.name || "").trim().slice(0, 120),
    areaId: input.areaId || null,
    billingMode,
    minuteAmount: billingMode === "EFFECTIVE_MINUTE" && !timeBandsEnabled ? Number(input.minuteAmount) : null,
    timeBandsEnabled,
    bandSets: timeBandsEnabled ? sanitizeBandSets(input.bandSets) : [],
    freePeriodSeconds: Math.max(0, Math.floor(Number(input.freePeriodMinutes || 0) * 60)),
    multiplyBySpaces: false,
    legalComplianceAccepted: input.legalComplianceAccepted === true,
    dailyFlatAmount: input.dailyFlatAmount === "" || input.dailyFlatAmount == null ? null : Number(input.dailyFlatAmount),
    overnightFlatAmount: input.overnightFlatAmount === "" || input.overnightFlatAmount == null ? null : Number(input.overnightFlatAmount),
    validFrom: input.validFrom ? new Date(input.validFrom).toISOString() : null,
    validUntil: input.validUntil ? new Date(input.validUntil).toISOString() : null,
    status: input.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    notes: String(input.notes || "").trim().slice(0, 500),
    blocks: billingMode === "EXPIRED_BLOCKS" ? (input.blocks || []).map((block, index) => ({
      sequence: index + 1,
      durationSeconds: Math.floor(Number(block.durationMinutes) * 60),
      amount: Number(block.amount),
      repeatAfter: block.repeatAfter === true,
    })) : [],
  };
}

// validateOperationalRate es la única regla de dominio: modalidad exclusiva, mínimos de
// tramos, y prohibición del valor nocturno fijo. Esta función no la repite, solo agrega
// las validaciones propias del formulario (nombre, vigencia, aceptación legal).
// context.parkingType: las franjas horarias son exclusivas de Off Street.
export function validateRateInput(input, context = {}) {
  const errors = validateOperationalRate(input);
  if (input.timeBandsEnabled && context.parkingType && context.parkingType !== "OFF_STREET") {
    errors.timeBands = "Las franjas horarias solo están disponibles para estacionamientos Off Street.";
  }
  if (!input.name) errors.name = "El nombre es obligatorio.";
  if (!input.legalComplianceAccepted) errors.legalComplianceAccepted = "Debes confirmar el cumplimiento de la Ley 20.967.";
  if (!input.validFrom) errors.validFrom = "La fecha de inicio es obligatoria.";
  if (input.validUntil && input.validUntil <= input.validFrom) errors.validUntil = "La fecha de término debe ser posterior al inicio.";
  if (input.dailyFlatAmount != null && !(input.dailyFlatAmount >= 0)) errors.dailyFlatAmount = "Ingresa un valor diario válido.";
  return errors;
}
