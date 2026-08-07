// Etiqueta visual principal de una tarifa (RateCard). Una tarifa REQUIRES_REVIEW nunca
// puede mostrar apariencia principal de "Activa", aunque su campo legacy `status` en base
// de datos siga en ACTIVE: la clasificación de cumplimiento (classifyRateCompliance) tiene
// prioridad visual absoluta sobre el estado legado. No decide si la tarifa se cobra —solo
// cómo se rotula—; la decisión de cobro sigue viviendo en selectActiveRate.
export function rateStatusBadge(rate) {
  const needsReview = rate?.compliance?.status === "REQUIRES_REVIEW";
  if (needsReview) return { label: "Requiere revisión", tone: "review" };
  return rate?.status === "ACTIVE" ? { label: "Activa", tone: "active" } : { label: "Borrador", tone: "draft" };
}
