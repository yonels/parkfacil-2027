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

// Línea «Tarifa» del comprobante: nombre + precio por minuto efectivo cobrado
// («$20 por minuto efectivo»; con varias franjas horarias, «$35, $25 y $20 por
// minuto efectivo»), y «tope aplicado» si corresponde. La APK corta el campo en
// 60 caracteres: si no cabe, se acorta y, como último recurso, se usa el resumen.
export const RECEIPT_RATE_MAX_LENGTH = 60;
const clp = (value) => `$${Math.round(Number(value) || 0).toLocaleString("es-CL")}`;

export function receiptRateDescription(rateName, breakdown, fallbackSummary = "") {
  const name = String(rateName || "").trim();
  const passes = breakdown?.kind === "TIME_BANDS" && Array.isArray(breakdown.passes)
    ? breakdown.passes.filter((pass) => Number(pass?.minutes) > 0)
    : [];
  const join = (...parts) => parts.filter(Boolean).join(" · ");
  if (!passes.length) return join(name, fallbackSummary);
  const prices = [...new Set(passes.map((pass) => Number(pass.minuteAmount || 0)))].sort((a, b) => b - a).map(clp);
  const priceList = prices.length === 1 ? prices[0] : `${prices.slice(0, -1).join(", ")} y ${prices[prices.length - 1]}`;
  const capApplied = passes.some((pass) => pass.capApplied);
  const candidates = [
    join(name, `${priceList} por minuto efectivo`, capApplied ? "tope aplicado" : ""),
    join(name, `${priceList} por minuto efectivo`, capApplied ? "tope" : ""),
    join(name, `${priceList} por min. efectivo`, capApplied ? "tope" : ""),
  ];
  return candidates.find((text) => text.length <= RECEIPT_RATE_MAX_LENGTH) || join(name, fallbackSummary);
}

// Pago liberado (SOL-2026-10-28-003): el comprobante muestra el tiempo liberado sin
// costo. Solo para estadías liberadas con cobro (desglose RELEASED_PAYMENT); las demás
// quedan igual. Líneas «PAGO LIBERADO» a $0 para cada tramo cubierto (entrada → salida
// impresa menos los tramos cobrados) y, si la tarifa es por franja horaria, el detalle
// real de los tramos cobrados. Sin franjas no se imprime un precio por minuto
// inventado: el cobro queda en TOTAL y en la línea Tarifa.
const RELEASED_LABEL = "PAGO LIBERADO";

export function releasedReceiptDetail(breakdown, entryAt, elapsedMinutes) {
  if (breakdown?.kind !== "RELEASED_PAYMENT") return null;
  const entryMs = Date.parse(entryAt);
  const minutes = Number(elapsedMinutes);
  if (!Number.isFinite(entryMs) || !Number.isFinite(minutes) || minutes < 0) return null;
  const endMs = entryMs + minutes * 60_000;
  const intervals = (Array.isArray(breakdown.intervals) ? breakdown.intervals : [])
    .map((interval) => ({ ...interval, startMs: Date.parse(interval.from), stopMs: Date.parse(interval.to) }))
    .filter((interval) => Number.isFinite(interval.startMs) && Number.isFinite(interval.stopMs))
    .sort((a, b) => a.startMs - b.startMs);

  const covered = [];
  let cursor = entryMs;
  for (const interval of intervals) {
    if (interval.startMs > cursor) covered.push([cursor, Math.min(interval.startMs, endMs)]);
    cursor = Math.max(cursor, interval.stopMs);
  }
  if (cursor < endMs) covered.push([cursor, endMs]);

  const time = (ms) => toOperationalDateTimeParts(new Date(ms).toISOString())?.entryTime || "";
  const coveredLines = covered
    .filter(([from, to]) => to - from >= 60_000)
    .map(([from, to]) => ({ from: time(from), to: time(to), label: RELEASED_LABEL, minutes: Math.floor((to - from) / 60_000), minuteAmount: 0, amount: 0, capAmount: null, capCount: 0 }));
  // Los minutos impresos cuadran con los minutos liberados del cálculo de cobro.
  const coveredMinutes = Number.isFinite(Number(breakdown.coveredMinutes)) ? Number(breakdown.coveredMinutes) : coveredLines.reduce((sum, line) => sum + line.minutes, 0);
  const printed = coveredLines.reduce((sum, line) => sum + line.minutes, 0);
  if (coveredLines.length && printed !== coveredMinutes) coveredLines[coveredLines.length - 1].minutes = Math.max(0, coveredLines[coveredLines.length - 1].minutes + coveredMinutes - printed);

  const passes = intervals.flatMap((interval) => (interval.breakdown?.kind === "TIME_BANDS" && Array.isArray(interval.breakdown.passes) ? interval.breakdown.passes : []));
  const bandLines = passes.length ? receiptChargeLines({ kind: "TIME_BANDS", passes }) : [];
  const chargeableMinutes = Number.isFinite(Number(breakdown.chargeableMinutes)) ? Number(breakdown.chargeableMinutes) : intervals.reduce((sum, interval) => sum + Number(interval.minutes || 0), 0);
  return { coveredMinutes, chargeableMinutes, chargeLines: [...coveredLines, ...bandLines] };
}

// Línea «Tarifa» de una estadía liberada: «Diurno · Liberado 57 min · Cobrado 112 min»,
// acortada si no cabe en el largo que imprime la APK.
export function releasedReceiptRateDescription(rateName, detail) {
  const name = String(rateName || "").trim();
  const join = (...parts) => parts.filter(Boolean).join(" · ");
  const released = `Liberado ${detail.coveredMinutes} min`;
  const charged = detail.chargeableMinutes > 0 ? `Cobrado ${detail.chargeableMinutes} min` : "";
  const candidates = [join(name, released, charged), join(name, released), join(released, charged), released];
  return candidates.find((text) => text.length <= RECEIPT_RATE_MAX_LENGTH) || released;
}
