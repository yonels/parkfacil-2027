// Texto para el operador cuando una estadía no se puede cobrar (SOL-2026-10-29-016).
// Antes el POS mostraba siempre «No existe una tarifa activa para esta estadía»,
// también cuando la tarifa existía pero no cubría la hora del ingreso. Puro: lo
// usan el servidor (toPagueAquiQuote) y el POS (cotización del listado).

function firstDetail(charge) {
  const errors = charge?.errors && typeof charge.errors === "object" ? Object.values(charge.errors) : [];
  const text = errors.find((value) => typeof value === "string" && value.trim());
  return text ? text.trim() : "";
}

export function quoteBlockedMessage({ reason, rateName = null, charge = null } = {}) {
  if (reason === "RELEASED_NO_CHARGE") return null;
  if (reason === "ACTIVE_RATE_NOT_FOUND" || reason === "NO_ACTIVE_RATE") {
    return "No hay una tarifa vigente para la hora de ingreso de este vehículo. Revisa las tarifas del estacionamiento.";
  }
  const rate = rateName ? `La tarifa «${rateName}»` : "La tarifa";
  if (reason === "RATE_REQUIRES_REVIEW") {
    const detail = firstDetail(charge);
    return detail ? `${rate} no puede calcular esta estadía: ${detail}` : `${rate} requiere revisión para calcular esta estadía.`;
  }
  return `${rate} no puede calcular esta estadía. Revisa su configuración.`;
}
