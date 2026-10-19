// Datos del comprobante de pago del POS que deben cuadrar entre sí (SOL-2026-10-18-001).
// Lógica pura, sin React, para probarla con node --test.
import { toOperationalDateTimeParts } from "../dataEntry.mjs";

// «Salida» impresa = hora del cálculo de cobro, ajustada al último minuto cobrado:
// entrada + minutos cobrados. La salida real (exit_at) se registra al confirmar el
// pago, segundos o minutos después del cálculo, y no cuadraría con «Tiempo».
// Así Entrada → Salida es siempre igual a los minutos impresos.
export function receiptExitInstant(stay, quote) {
  const entryMs = Date.parse(stay?.entry_at);
  const minutes = Number(quote?.elapsedMinutes);
  if (Number.isFinite(entryMs) && quote?.elapsedMinutes != null && Number.isFinite(minutes) && minutes >= 0) {
    return new Date(entryMs + minutes * 60_000).toISOString();
  }
  return quote?.snapshot?.calculatedAt || stay?.exit_at || null;
}

// Una línea por franja horaria cobrada: horas de inicio y fin (hora de Chile),
// minutos, precio por minuto y monto. La suma de los montos es el total cobrado.
export function receiptChargeLines(breakdown) {
  if (breakdown?.kind !== "TIME_BANDS" || !Array.isArray(breakdown.passes)) return [];
  return breakdown.passes
    .filter((pass) => Number(pass?.minutes) > 0)
    .map((pass) => ({
      from: toOperationalDateTimeParts(pass.from)?.entryTime || "",
      to: toOperationalDateTimeParts(pass.to)?.entryTime || "",
      minutes: Number(pass.minutes),
      minuteAmount: Number(pass.minuteAmount || 0),
      amount: Number(pass.amount || 0),
      capApplied: Boolean(pass.capApplied),
    }));
}
