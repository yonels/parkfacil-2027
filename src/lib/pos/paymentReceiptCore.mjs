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

// Una línea por franja horaria, agrupando todos los días de la estadía: horario de la
// franja (hora de Chile), nombre, minutos, precio por minuto, monto y cuántas veces se
// aplicó el tope. Los minutos suman «Tiempo» y los montos suman el total, y el largo
// es fijo (una línea por franja horaria) aunque la estadía dure varios días.
export function receiptChargeLines(breakdown) {
  if (breakdown?.kind !== "TIME_BANDS" || !Array.isArray(breakdown.passes)) return [];
  const groups = new Map();
  for (const pass of breakdown.passes) {
    if (!(Number(pass?.minutes) > 0)) continue;
    const key = [pass.setLabel, pass.bandStart, pass.bandEnd, pass.label, pass.minuteAmount, pass.capAmount].join("|");
    const group = groups.get(key) || {
      from: pass.bandStart || toOperationalDateTimeParts(pass.from)?.entryTime || "",
      to: pass.bandEnd || toOperationalDateTimeParts(pass.to)?.entryTime || "",
      label: String(pass.label || "").trim(),
      minutes: 0,
      minuteAmount: Number(pass.minuteAmount || 0),
      amount: 0,
      capAmount: pass.capAmount == null ? null : Number(pass.capAmount),
      capCount: 0,
    };
    group.minutes += Number(pass.minutes);
    group.amount += Number(pass.amount || 0);
    if (pass.capApplied) group.capCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.from.localeCompare(b.from) || a.label.localeCompare(b.label, "es"));
}
