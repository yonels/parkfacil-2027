// Off Street — Pago liberado (Etapa 2, P8a 2026-10-18): cobro del tiempo NO
// cubierto de una estadía liberada. Puro (sin red).
//
// - Cada intervalo no cubierto se cobra POR SEPARADO con la tarifa vigente del
//   estacionamiento, usando sus instantes reales: con franjas horarias, cada
//   minuto vale según su hora y se aplica el tope de su franja horaria
//   (SOL-2026-10-08-003); sin franjas, minuto efectivo o tramo vencido (Ley
//   20.967, sin redondear al alza). No existe un tope propio de Pago liberado.
// - Los minutos de gracia (freePeriodSeconds) de la tarifa se aplican UNA vez
//   por estadía: solo al primer intervalo no cubierto.
// - Si un intervalo requiere revisión (tarifa inválida o regla que el motor no
//   resuelve), toda la cotización queda bloqueada para revisión.

import { calculateScheduledParkingCharge } from "../parkingRates.mjs";
import { buildChargeBreakdown } from "../parkingTimeBands.mjs";

export function quoteUncoveredIntervals({ rate, intervals = [], holidays = [] }) {
  if (!intervals.length) return { valid: true, amount: 0, chargedSeconds: 0, intervals: [] };
  if (!rate) return { valid: false, reason: "ACTIVE_RATE_NOT_FOUND" };
  const detail = [];
  let amount = 0;
  let chargedSeconds = 0;
  for (const [index, [startMs, endMs]] of intervals.entries()) {
    const effectiveRate = index === 0 ? rate : { ...rate, freePeriodSeconds: 0 };
    const from = new Date(startMs);
    const to = new Date(endMs);
    const charge = calculateScheduledParkingCharge(effectiveRate, from, to, { holidays });
    if (!charge.valid || charge.requiresDailyPolicy) {
      return { valid: false, reason: "RATE_REQUIRES_REVIEW", interval: { from: from.toISOString(), to: to.toISOString() }, charge };
    }
    const intervalAmount = Math.max(0, Math.floor(Number(charge.amount) || 0));
    amount += intervalAmount;
    const seconds = Math.floor((endMs - startMs) / 1000);
    chargedSeconds += seconds;
    detail.push({
      from: from.toISOString(),
      to: to.toISOString(),
      seconds,
      minutes: Math.floor(seconds / 60),
      amount: intervalAmount,
      breakdown: rate.timeBandsEnabled ? buildChargeBreakdown(charge, { rateId: rate.id }) : null,
    });
  }
  return { valid: true, amount, chargedSeconds, intervals: detail };
}
