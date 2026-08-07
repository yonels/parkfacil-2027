import { validateOperationalRate } from "./parkingRates.mjs";

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
  return {
    name: String(input.name || "").trim().slice(0, 120),
    areaId: input.areaId || null,
    billingMode,
    minuteAmount: billingMode === "EFFECTIVE_MINUTE" ? Number(input.minuteAmount) : null,
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
export function validateRateInput(input) {
  const errors = validateOperationalRate(input);
  if (!input.name) errors.name = "El nombre es obligatorio.";
  if (!input.legalComplianceAccepted) errors.legalComplianceAccepted = "Debes confirmar el cumplimiento de la Ley 20.967.";
  if (!input.validFrom) errors.validFrom = "La fecha de inicio es obligatoria.";
  if (input.validUntil && input.validUntil <= input.validFrom) errors.validUntil = "La fecha de término debe ser posterior al inicio.";
  if (input.dailyFlatAmount != null && !(input.dailyFlatAmount >= 0)) errors.dailyFlatAmount = "Ingresa un valor diario válido.";
  return errors;
}
