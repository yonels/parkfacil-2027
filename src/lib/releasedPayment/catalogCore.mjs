// Off Street — Pago liberado (Fase A): catálogo y cálculo comercial.
//
// Módulo puro (sin DB) para que la API, la UI de Root y la cotización del
// CRM usen exactamente las mismas reglas:
// - Precios en UF NETOS por estacionamiento (se presentan "+ IVA").
// - package_price_uf es el TOTAL del período de la modalidad.
// - additional_spot_price_uf es el precio de UNA plaza adicional por el
//   período completo; null = pendiente de definición -> cotizar plazas
//   adicionales en esa modalidad queda BLOQUEADO (nunca se deriva del mensual).
// - Contratar menos plazas que las incluidas no prorratea el paquete.
// - El equivalente mensual es solo informativo; nunca se suman períodos
//   distintos.

export const RELEASED_PAYMENT_MODALITIES = Object.freeze({
  MONTHLY: Object.freeze({ code: "MONTHLY", periodMonths: 1, label: "Mensual" }),
  SEMIANNUAL: Object.freeze({ code: "SEMIANNUAL", periodMonths: 6, label: "Semestral" }),
  ANNUAL: Object.freeze({ code: "ANNUAL", periodMonths: 12, label: "Anual" }),
});

export const RELEASED_PAYMENT_MODALITY_CODES = Object.freeze(Object.keys(RELEASED_PAYMENT_MODALITIES));

// Sin precios en código: todos los valores viven en released_payment_catalog
// y los edita solo Root. La migración 20261001090000 siembra valores
// INICIALES editables; el código nunca los repite ni los completa.

const MAX_UF = 10000;
const MAX_SPOTS = 1000;

function isUfAmount(value) {
  return Number.isFinite(value) && value >= 0 && value <= MAX_UF && Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
}

export function catalogRowFromDb(row) {
  if (!row) return null;
  return {
    modality: row.modality,
    periodMonths: Number(row.period_months),
    packagePriceUf: Number(row.package_price_uf),
    includedSpots: Number(row.included_spots),
    additionalSpotPriceUf: row.additional_spot_price_uf === null || row.additional_spot_price_uf === undefined ? null : Number(row.additional_spot_price_uf),
    availableInQuotes: Boolean(row.available_in_quotes),
    notes: String(row.notes || ""),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

// Orden fijo MONTHLY, SEMIANNUAL, ANNUAL con las filas EXISTENTES en la
// base. Una modalidad ausente se omite: nunca se completa con precios.
export function normalizeCatalog(rows) {
  const byModality = new Map((Array.isArray(rows) ? rows : []).filter(Boolean).map((row) => [row.modality, row]));
  return RELEASED_PAYMENT_MODALITY_CODES.filter((code) => byModality.has(code)).map((code) => byModality.get(code));
}

// Entrada de Root (formulario/API). Devuelve { rows, errors }. Los campos
// vacíos de "plaza adicional" significan pendiente (null), nunca 0.
export function sanitizeCatalogInput(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const rows = items.map((item) => {
    const additionalRaw = item?.additionalSpotPriceUf;
    const additional = additionalRaw === null || additionalRaw === undefined || String(additionalRaw).trim() === "" ? null : Number(String(additionalRaw).replace(",", "."));
    return {
      modality: String(item?.modality || "").trim().toUpperCase(),
      packagePriceUf: Number(String(item?.packagePriceUf ?? "").replace(",", ".")),
      includedSpots: Number(item?.includedSpots),
      additionalSpotPriceUf: additional,
      availableInQuotes: item?.availableInQuotes === true,
      notes: String(item?.notes || "").trim().slice(0, 500),
    };
  });
  return { rows, errors: validateCatalogRows(rows) };
}

export function validateCatalogRows(rows) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length !== RELEASED_PAYMENT_MODALITY_CODES.length) {
    errors.push("Debe informar las tres modalidades (mensual, semestral y anual).");
    return errors;
  }
  const seen = new Set();
  for (const row of rows) {
    const modality = RELEASED_PAYMENT_MODALITIES[row?.modality];
    const label = modality?.label || row?.modality || "modalidad";
    if (!modality) errors.push(`Modalidad inválida: ${row?.modality || "vacía"}.`);
    if (seen.has(row?.modality)) errors.push(`Modalidad duplicada: ${label}.`);
    seen.add(row?.modality);
    if (!isUfAmount(row?.packagePriceUf)) errors.push(`${label}: el precio del paquete debe ser un valor UF entre 0 y ${MAX_UF}, con máximo dos decimales.`);
    if (!Number.isInteger(row?.includedSpots) || row.includedSpots < 1 || row.includedSpots > MAX_SPOTS) errors.push(`${label}: las plazas incluidas deben ser un entero entre 1 y ${MAX_SPOTS}.`);
    if (row?.additionalSpotPriceUf !== null && !isUfAmount(row?.additionalSpotPriceUf)) errors.push(`${label}: el precio de plaza adicional debe ser un valor UF válido o quedar vacío (pendiente).`);
  }
  return errors;
}

export function catalogRowToDb(row, { updatedBy, now = new Date() } = {}) {
  return {
    modality: row.modality,
    period_months: RELEASED_PAYMENT_MODALITIES[row.modality].periodMonths,
    package_price_uf: row.packagePriceUf,
    included_spots: row.includedSpots,
    additional_spot_price_uf: row.additionalSpotPriceUf,
    available_in_quotes: Boolean(row.availableInQuotes),
    notes: row.notes || "",
    updated_by: updatedBy || null,
    updated_at: now.toISOString(),
  };
}

// Campos comerciales que cambiaron (para auditoría). Vacío = sin cambios.
export function diffCatalogRow(previous, next) {
  const fields = ["packagePriceUf", "includedSpots", "additionalSpotPriceUf", "availableInQuotes", "notes"];
  return fields.filter((field) => (previous?.[field] ?? null) !== (next?.[field] ?? null));
}

function roundUf(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Cotización de Pago liberado para UN estacionamiento. Resultado:
// { ok: true, quote } con el snapshot completo a guardar en la propuesta, o
// { ok: false, code, message } (nunca un monto inventado).
export function quoteReleasedPayment(catalogRow, { contractedSpots } = {}) {
  const modality = RELEASED_PAYMENT_MODALITIES[catalogRow?.modality];
  if (!modality) return { ok: false, code: "INVALID_MODALITY", message: "Selecciona una modalidad válida." };
  const spots = Number(contractedSpots);
  if (!Number.isInteger(spots) || spots < 1 || spots > MAX_SPOTS) {
    return { ok: false, code: "INVALID_SPOTS", message: `Las plazas contratadas deben ser un entero entre 1 y ${MAX_SPOTS}.` };
  }
  if (!isUfAmount(catalogRow.packagePriceUf)) return { ok: false, code: "INVALID_CATALOG", message: "El catálogo de Pago liberado no tiene un precio de paquete válido." };

  const includedSpots = catalogRow.includedSpots;
  const additionalSpots = Math.max(0, spots - includedSpots);
  if (additionalSpots > 0 && catalogRow.additionalSpotPriceUf === null) {
    return {
      ok: false,
      code: "ADDITIONAL_PRICE_PENDING",
      message: `El precio de plazas adicionales para la modalidad ${modality.label.toLowerCase()} está pendiente de definición. Cotiza hasta ${includedSpots} plazas o elige otra modalidad.`,
    };
  }
  const additionalUnit = additionalSpots > 0 ? catalogRow.additionalSpotPriceUf : catalogRow.additionalSpotPriceUf ?? null;
  const additionalTotal = additionalSpots > 0 ? roundUf(additionalSpots * catalogRow.additionalSpotPriceUf) : 0;
  const totalPeriod = roundUf(catalogRow.packagePriceUf + additionalTotal);

  return {
    ok: true,
    quote: {
      module: "PAGO_LIBERADO",
      modality: modality.code,
      modalityLabel: modality.label,
      periodMonths: modality.periodMonths,
      currency: "UF",
      taxNote: "+ IVA",
      packagePriceUf: catalogRow.packagePriceUf,
      includedSpots,
      contractedSpots: spots,
      additionalSpots,
      additionalSpotPriceUf: additionalUnit,
      additionalTotalUf: additionalTotal,
      totalPeriodUf: totalPeriod,
      // Solo informativo: el compromiso es el total del período.
      monthlyEquivalentUf: roundUf(totalPeriod / modality.periodMonths, 4),
    },
  };
}
