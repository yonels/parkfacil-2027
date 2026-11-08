// Catálogo de servicios y productos de ParkFacil (SOL-2026-11-05-005, F1.1).
// Validación pura, sin acceso a base de datos, para poder probarla con node --test.

export const CATALOG_ITEM_KINDS = Object.freeze({ SERVICE: "Servicio", PRODUCT: "Producto" });
export const CATALOG_CATEGORIES = Object.freeze({
  FEE: "Cuota", SUBSCRIPTION: "Suscripción", PARKING: "Estacionamiento", DEVICE: "Dispositivo",
  IMPLEMENTATION: "Implementación", INTEGRATION: "Integración", SUPPORT: "Soporte",
  SERVICE: "Servicio", DISCOUNT: "Descuento", OTHER: "Otro",
});
export const CATALOG_TAX_CATEGORIES = Object.freeze({ TAXABLE: "Afecto a IVA", EXEMPT: "Exento", UNDEFINED: "Sin definir" });
export const CATALOG_PERIODICITIES = Object.freeze({ MONTHLY: "Mensual", ANNUAL: "Anual", ONE_TIME: "Única vez" });
export const CATALOG_CURRENCIES = Object.freeze({ UF: "UF", CLP: "CLP" });
export const CATALOG_STATUSES = Object.freeze({ ACTIVE: "Activo", INACTIVE: "Inactivo" });

export class CatalogValidationError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = "CatalogValidationError";
    this.code = code;
    this.field = field;
    this.status = 422;
  }
}

// Decisión del usuario 2026-11-08: el código lo asigna la base de datos (SERV-01, PROD-01…) y no se edita.
export const CATALOG_CODE_PATTERN = /^(SERV|PROD)-[0-9]{2,}$/;

function oneOf(value, allowed, code, message, field) {
  if (!Object.hasOwn(allowed, value)) throw new CatalogValidationError(code, message, field);
  return value;
}

export function normalizeCatalogCode(value) {
  return String(value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function parseReferencePrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const text = String(value).trim().replace(/\s/g, "");
  // Acepta "1,5" y "1.5"; si trae ambos separadores, el punto es de miles («1.234,56»).
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0) throw new CatalogValidationError("CATALOG_PRICE_INVALID", "El precio de referencia debe ser un número mayor o igual a cero.", "referencePrice");
  return Math.round(price * 10000) / 10000;
}

// Valida y normaliza un servicio o producto. `partial` permite editar solo algunos campos.
export function validateCatalogInput(input = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => !partial || Object.hasOwn(input, key);

  if (has("name")) {
    const name = String(input.name || "").trim();
    if (name.length < 2 || name.length > 120) throw new CatalogValidationError("CATALOG_NAME_INVALID", "El nombre es obligatorio (2 a 120 caracteres).", "name");
    out.name = name;
  }
  if (has("description")) {
    const description = String(input.description || "").trim();
    if (description.length > 500) throw new CatalogValidationError("CATALOG_DESCRIPTION_INVALID", "La descripción admite hasta 500 caracteres.", "description");
    out.description = description;
  }
  if (has("itemKind")) out.itemKind = oneOf(input.itemKind || "SERVICE", CATALOG_ITEM_KINDS, "CATALOG_KIND_INVALID", "El tipo debe ser servicio o producto.", "itemKind");
  if (has("category")) out.category = oneOf(input.category || "SERVICE", CATALOG_CATEGORIES, "CATALOG_CATEGORY_INVALID", "La categoría no es válida.", "category");
  if (has("unit")) {
    const unit = String(input.unit || "unit").trim();
    if (!unit || unit.length > 30) throw new CatalogValidationError("CATALOG_UNIT_INVALID", "La unidad es obligatoria (hasta 30 caracteres).", "unit");
    out.unit = unit;
  }
  if (has("taxCategory")) out.taxCategory = oneOf(input.taxCategory || "TAXABLE", CATALOG_TAX_CATEGORIES, "CATALOG_TAX_INVALID", "Indica si es afecto o exento de IVA.", "taxCategory");
  if (has("periodicity")) out.periodicity = oneOf(input.periodicity || "MONTHLY", CATALOG_PERIODICITIES, "CATALOG_PERIODICITY_INVALID", "La periodicidad no es válida.", "periodicity");
  if (has("referenceCurrency")) out.referenceCurrency = oneOf(input.referenceCurrency || "UF", CATALOG_CURRENCIES, "CATALOG_CURRENCY_INVALID", "La moneda debe ser UF o CLP.", "referenceCurrency");
  if (has("referencePrice")) out.referencePrice = parseReferencePrice(input.referencePrice);
  if (has("status")) out.status = oneOf(input.status || "ACTIVE", CATALOG_STATUSES, "CATALOG_STATUS_INVALID", "El estado debe ser activo o inactivo.", "status");

  if (out.category === "DISCOUNT" && out.itemKind === "PRODUCT") throw new CatalogValidationError("CATALOG_KIND_INVALID", "Un descuento no puede ser un producto.", "itemKind");
  if (partial && !Object.keys(out).length) throw new CatalogValidationError("CATALOG_NO_CHANGES", "No hay cambios para guardar.");
  return out;
}

export function toCatalogRow(values, actorId) {
  const map = { name: "name", description: "description", itemKind: "item_kind", category: "category", unit: "unit", taxCategory: "tax_category", periodicity: "periodicity", referenceCurrency: "reference_currency", referencePrice: "reference_price", status: "status" };
  const row = {};
  for (const [key, column] of Object.entries(map)) if (Object.hasOwn(values, key)) row[column] = values[key];
  if (actorId) row.updated_by = actorId;
  return row;
}

export function fromCatalogRow(row) {
  return {
    id: row.id, code: row.code, name: row.name, description: row.description || "",
    itemKind: row.item_kind, category: row.category, unit: row.unit, taxCategory: row.tax_category,
    periodicity: row.periodicity, referenceCurrency: row.reference_currency,
    referencePrice: row.reference_price == null ? null : Number(row.reference_price),
    status: row.status, usageCount: Number(row.usage_count || 0), updatedAt: row.updated_at,
  };
}

export function catalogAuditAction(previous, next) {
  if (!previous) return "CREATED";
  if (previous.status !== next.status && Object.keys(next).length <= 3) return next.status === "ACTIVE" ? "ACTIVATED" : "DEACTIVATED";
  return "UPDATED";
}
