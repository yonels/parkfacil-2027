// Off Street — Pago liberado (Fase A): liberación comercial por modalidad.
//
// DEFINICIÓN COMERCIAL FINAL (usuario, 2026-10-01): el precio que ParkFacil
// cobra por habilitar el módulo queda ABIERTO y se indica en cada
// cotización/propuesta (modalidad, período, importe y cupos simultáneos).
// No hay paquetes, precios unitarios, tramos ni valores de catálogo, y el
// importe nunca se calcula a partir de los cupos.
//
// Este módulo puro solo describe las modalidades y su disponibilidad en
// propuestas (interruptor exclusivo de Root, apagado por defecto).

export const RELEASED_PAYMENT_MODALITIES = Object.freeze({
  MONTHLY: Object.freeze({ code: "MONTHLY", periodMonths: 1, label: "Mensual" }),
  SEMIANNUAL: Object.freeze({ code: "SEMIANNUAL", periodMonths: 6, label: "Semestral" }),
  ANNUAL: Object.freeze({ code: "ANNUAL", periodMonths: 12, label: "Anual" }),
});

export const RELEASED_PAYMENT_MODALITY_CODES = Object.freeze(Object.keys(RELEASED_PAYMENT_MODALITIES));

export function catalogRowFromDb(row) {
  if (!row) return null;
  return {
    modality: row.modality,
    periodMonths: Number(row.period_months),
    availableInQuotes: Boolean(row.available_in_quotes),
    notes: String(row.notes || ""),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
  };
}

// Orden fijo MONTHLY, SEMIANNUAL, ANNUAL con las filas EXISTENTES en la
// base. Una modalidad ausente se omite: nunca se completa.
export function normalizeCatalog(rows) {
  const byModality = new Map((Array.isArray(rows) ? rows : []).filter(Boolean).map((row) => [row.modality, row]));
  return RELEASED_PAYMENT_MODALITY_CODES.filter((code) => byModality.has(code)).map((code) => byModality.get(code));
}

// Normaliza la edición de Root: solo disponibilidad y notas.
export function sanitizeCatalogInput(input) {
  const items = Array.isArray(input?.items) ? input.items : [];
  const rows = items.map((item) => ({
    modality: String(item?.modality || "").trim().toUpperCase(),
    availableInQuotes: item?.availableInQuotes === true,
    notes: String(item?.notes || "").trim().slice(0, 500),
  }));
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
  }
  return errors;
}

export function catalogRowToDb(row, { updatedBy, now = new Date() } = {}) {
  return {
    modality: row.modality,
    period_months: RELEASED_PAYMENT_MODALITIES[row.modality].periodMonths,
    available_in_quotes: Boolean(row.availableInQuotes),
    notes: row.notes || "",
    updated_by: updatedBy || null,
    updated_at: now.toISOString(),
  };
}

// Campos que cambiaron (para auditoría). Vacío = sin cambios.
export function diffCatalogRow(previous, next) {
  const fields = ["availableInQuotes", "notes"];
  return fields.filter((field) => (previous?.[field] ?? null) !== (next?.[field] ?? null));
}
