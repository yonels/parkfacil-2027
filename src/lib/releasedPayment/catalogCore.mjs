// Off Street — Pago liberado: liberación comercial del módulo (solo Root).
//
// DEFINICIÓN COMERCIAL VIGENTE (usuario, 2026-10-05, SOL-2026-10-05-002):
// ParkFacil cobra una tarifa MENSUAL configurable + IVA por el módulo,
// independiente de cupos, patentes, beneficiarios y de las tarifas que el
// cliente cobra a sus beneficiarios. El fee se indica en cada propuesta y
// Root lo registra en la contratación.
//
// Este módulo puro describe la única modalidad vigente (MONTHLY_FEE) y su
// disponibilidad en propuestas (interruptor exclusivo de Root, apagado por
// defecto). Las modalidades anteriores (cobro único de SOL-2026-10-05-001 y
// periódicas de SOL-2026-10-04-004) se conservan SOLO para leer
// contrataciones y propuestas históricas: no se ofrecen ni se habilitan.

export const RELEASED_PAYMENT_UNITS = Object.freeze({
  HOUR: Object.freeze({ code: "HOUR", singular: "hora", plural: "horas" }),
  DAY: Object.freeze({ code: "DAY", singular: "día", plural: "días" }),
  MONTH: Object.freeze({ code: "MONTH", singular: "mes", plural: "meses" }),
});

export const ONE_TIME_MODALITY = "ONE_TIME";
export const MONTHLY_FEE_MODALITY = "MONTHLY_FEE";

export const RELEASED_PAYMENT_MODALITIES = Object.freeze({
  MONTHLY_FEE: Object.freeze({ code: "MONTHLY_FEE", billingUnit: "MONTH", unitQuantity: 1, periodMonths: null, label: "Importe mensual del módulo", legacy: false }),
  ONE_TIME: Object.freeze({ code: "ONE_TIME", billingUnit: "ONE_TIME", unitQuantity: 1, periodMonths: null, label: "Habilitación de cobro único (anterior)", legacy: true }),
  HOURLY: Object.freeze({ code: "HOURLY", billingUnit: "HOUR", unitQuantity: 1, periodMonths: null, label: "Por hora (anterior)", legacy: true }),
  DAILY: Object.freeze({ code: "DAILY", billingUnit: "DAY", unitQuantity: 1, periodMonths: null, label: "Por día (anterior)", legacy: true }),
  MONTHLY: Object.freeze({ code: "MONTHLY", billingUnit: "MONTH", unitQuantity: 1, periodMonths: 1, label: "Mensual (anterior)", legacy: true }),
  SEMIANNUAL: Object.freeze({ code: "SEMIANNUAL", billingUnit: "MONTH", unitQuantity: 6, periodMonths: 6, label: "Semestral (anterior)", legacy: true }),
  ANNUAL: Object.freeze({ code: "ANNUAL", billingUnit: "MONTH", unitQuantity: 12, periodMonths: 12, label: "Anual (anterior)", legacy: true }),
});

export function unitQuantityText(quantity, unitCode) {
  const unit = RELEASED_PAYMENT_UNITS[unitCode];
  if (!unit) return String(quantity);
  return `${quantity} ${Number(quantity) === 1 ? unit.singular : unit.plural}`;
}

export const RELEASED_PAYMENT_MODALITY_CODES = Object.freeze(Object.keys(RELEASED_PAYMENT_MODALITIES));
// Única modalidad que Root puede liberar para propuestas nuevas.
export const EDITABLE_MODALITY_CODES = Object.freeze([MONTHLY_FEE_MODALITY]);

export function catalogRowFromDb(row) {
  if (!row) return null;
  return {
    modality: row.modality,
    periodMonths: row.period_months === null || row.period_months === undefined ? null : Number(row.period_months),
    billingUnit: row.billing_unit || RELEASED_PAYMENT_MODALITIES[row.modality]?.billingUnit || null,
    unitQuantity: Number(row.unit_quantity ?? RELEASED_PAYMENT_MODALITIES[row.modality]?.unitQuantity),
    availableInQuotes: Boolean(row.available_in_quotes),
    notes: String(row.notes || ""),
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    legacy: RELEASED_PAYMENT_MODALITIES[row.modality]?.legacy !== false,
  };
}

// Orden fijo (MONTHLY_FEE primero) con las filas EXISTENTES en la base. Una
// modalidad ausente se omite: nunca se completa.
export function normalizeCatalog(rows) {
  const byModality = new Map((Array.isArray(rows) ? rows : []).filter(Boolean).map((row) => [row.modality, row]));
  return RELEASED_PAYMENT_MODALITY_CODES.filter((code) => byModality.has(code)).map((code) => byModality.get(code));
}

// Normaliza la edición de Root: solo disponibilidad y notas de MONTHLY_FEE.
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
  if (!Array.isArray(rows) || rows.length !== EDITABLE_MODALITY_CODES.length) {
    errors.push("Solo se edita el importe mensual del módulo (las modalidades anteriores no se ofrecen).");
    return errors;
  }
  for (const row of rows) {
    if (!EDITABLE_MODALITY_CODES.includes(row?.modality)) {
      errors.push(`Modalidad no editable: ${RELEASED_PAYMENT_MODALITIES[row?.modality]?.label || row?.modality || "vacía"}.`);
    }
  }
  return errors;
}

export function catalogRowToDb(row, { updatedBy, now = new Date() } = {}) {
  return {
    modality: row.modality,
    period_months: RELEASED_PAYMENT_MODALITIES[row.modality].periodMonths,
    billing_unit: RELEASED_PAYMENT_MODALITIES[row.modality].billingUnit,
    unit_quantity: RELEASED_PAYMENT_MODALITIES[row.modality].unitQuantity,
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
