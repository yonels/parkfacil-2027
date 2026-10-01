// Off Street — Pago liberado (Fase A): catálogo y cálculo comercial.
//
// Módulo puro (sin DB) para que la API, la UI de Root y la cotización del
// CRM usen exactamente las mismas reglas:
// - SIN paquetes: los cupos son UNITARIOS. Cada modalidad tiene un precio
//   por cupo para su período completo; cotización = cupos × precio por cupo.
// - Precios en UF NETOS (se presentan "+ IVA"), configurables solo por Root.
// - Precio null = pendiente de definición: esa modalidad no se cotiza ni
//   puede estar disponible en propuestas. Nunca se deriva de otra modalidad.
// - Los cupos solo limitan la ocupación simultánea: no crean autorizaciones.
// - El equivalente mensual es solo informativo; nunca se suman períodos.

export const RELEASED_PAYMENT_MODALITIES = Object.freeze({
  MONTHLY: Object.freeze({ code: "MONTHLY", periodMonths: 1, label: "Mensual" }),
  SEMIANNUAL: Object.freeze({ code: "SEMIANNUAL", periodMonths: 6, label: "Semestral" }),
  ANNUAL: Object.freeze({ code: "ANNUAL", periodMonths: 12, label: "Anual" }),
});

export const RELEASED_PAYMENT_MODALITY_CODES = Object.freeze(Object.keys(RELEASED_PAYMENT_MODALITIES));

// Sin precios en código: todos los valores viven en released_payment_catalog
// y los edita solo Root. El código nunca los repite ni los completa.

const MAX_UF = 10000;
const MAX_CUPOS = 1000;

function isUfAmount(value) {
  return Number.isFinite(value) && value >= 0 && value <= MAX_UF && Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
}

function ufOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

export function catalogRowFromDb(row) {
  if (!row) return null;
  return {
    modality: row.modality,
    periodMonths: Number(row.period_months),
    cupoPriceUf: ufOrNull(row.cupo_price_uf),
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

// Normaliza la edición de Root. Acepta coma decimal; precio vacío = pendiente (null), nunca 0.
export function sanitizeCatalogInput(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const rows = items.map((item) => {
    const raw = item?.cupoPriceUf;
    const price = raw === null || raw === undefined || String(raw).trim() === "" ? null : Number(String(raw).replace(",", "."));
    return {
      modality: String(item?.modality || "").trim().toUpperCase(),
      cupoPriceUf: price,
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
    if (row?.cupoPriceUf !== null && !isUfAmount(row?.cupoPriceUf)) {
      errors.push(`${label}: el precio por cupo debe ser un valor UF entre 0 y ${MAX_UF}, con máximo dos decimales, o quedar vacío (pendiente).`);
    }
    if (row?.availableInQuotes && row?.cupoPriceUf === null) {
      errors.push(`${label}: no puede estar disponible en propuestas sin precio por cupo definido.`);
    }
  }
  return errors;
}

export function catalogRowToDb(row, { updatedBy, now = new Date() } = {}) {
  return {
    modality: row.modality,
    period_months: RELEASED_PAYMENT_MODALITIES[row.modality].periodMonths,
    cupo_price_uf: row.cupoPriceUf,
    available_in_quotes: Boolean(row.availableInQuotes),
    notes: row.notes || "",
    updated_by: updatedBy || null,
    updated_at: now.toISOString(),
  };
}

// Campos comerciales que cambiaron (para auditoría). Vacío = sin cambios.
export function diffCatalogRow(previous, next) {
  const fields = ["cupoPriceUf", "availableInQuotes", "notes"];
  return fields.filter((field) => (previous?.[field] ?? null) !== (next?.[field] ?? null));
}

function roundUf(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Cotización de Pago liberado para UN estacionamiento: cupos × precio por
// cupo de la modalidad. { ok: true, quote } o { ok: false, code, message }
// (nunca un monto inventado).
export function quoteReleasedPayment(catalogRow, { contractedCupos } = {}) {
  const modality = RELEASED_PAYMENT_MODALITIES[catalogRow?.modality];
  if (!modality) return { ok: false, code: "INVALID_MODALITY", message: "Selecciona una modalidad válida." };
  const cupos = Number(contractedCupos);
  if (!Number.isInteger(cupos) || cupos < 1 || cupos > MAX_CUPOS) {
    return { ok: false, code: "INVALID_CUPOS", message: `Los cupos contratados deben ser un entero entre 1 y ${MAX_CUPOS}.` };
  }
  if (catalogRow.cupoPriceUf === null || catalogRow.cupoPriceUf === undefined) {
    return { ok: false, code: "CUPO_PRICE_PENDING", message: `El precio por cupo de la modalidad ${modality.label.toLowerCase()} está pendiente de definición.` };
  }
  if (!isUfAmount(catalogRow.cupoPriceUf)) return { ok: false, code: "INVALID_CATALOG", message: "El catálogo de Pago liberado no tiene un precio por cupo válido." };

  const totalPeriod = roundUf(cupos * catalogRow.cupoPriceUf);
  return {
    ok: true,
    quote: {
      module: "PAGO_LIBERADO",
      modality: modality.code,
      modalityLabel: modality.label,
      periodMonths: modality.periodMonths,
      currency: "UF",
      taxNote: "+ IVA",
      cupoPriceUf: catalogRow.cupoPriceUf,
      contractedCupos: cupos,
      totalPeriodUf: totalPeriod,
      // Solo informativo: el compromiso es el total del período.
      monthlyEquivalentUf: roundUf(totalPeriod / modality.periodMonths, 4),
    },
  };
}
