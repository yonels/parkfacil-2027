// Servicios a facturar por empresa (SOL-2026-11-05-005, F1.2).
// Decisiones del usuario 2026-11-05: si la empresa no tiene contrato vigente se crea un contrato mínimo
// (inicio, plazo en meses, renovación automática y días de pago; moneda UF); por ahora todo se factura
// mensualmente (la periodicidad del catálogo es informativa).

export class CompanyServiceError extends Error {
  constructor(code, message, field = null, status = 422) {
    super(message);
    this.name = "CompanyServiceError";
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!DATE.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseNumber(value, { field, code, message, min = 0, allowZero = true }) {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  if (!text || !Number.isFinite(number) || number < min || (!allowZero && number === 0)) throw new CompanyServiceError(code, message, field);
  return Math.round(number * 10000) / 10000;
}

export function addMonths(isoDate, months) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

// Término = inicio + plazo − 1 día (un contrato de 12 meses desde 2026-11-01 termina el 2027-10-31).
export function contractEndDate(startsOn, durationMonths) {
  const end = new Date(`${addMonths(startsOn, durationMonths)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function contractNumberFor({ rutNumber, companyId, startsOn }) {
  const base = String(rutNumber || companyId || "EMPRESA").replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 20);
  return `FACT-${base}-${startsOn.slice(0, 7).replace("-", "")}`;
}

export function validateMinimalContract(input = {}) {
  const startsOn = String(input.startsOn || "").trim();
  if (!isValidDate(startsOn)) throw new CompanyServiceError("CONTRACT_START_INVALID", "La fecha de inicio no es válida.", "startsOn");
  const durationMonths = Number(input.durationMonths);
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) throw new CompanyServiceError("CONTRACT_DURATION_INVALID", "El plazo debe ser de 1 a 120 meses.", "durationMonths");
  const paymentDueDays = Number(input.paymentDueDays);
  if (!Number.isInteger(paymentDueDays) || paymentDueDays < 0 || paymentDueDays > 120) throw new CompanyServiceError("CONTRACT_DUE_DAYS_INVALID", "Los días de pago deben ser de 0 a 120.", "paymentDueDays");
  const currency = String(input.currency || "UF").toUpperCase();
  if (!["UF", "CLP"].includes(currency)) throw new CompanyServiceError("CONTRACT_CURRENCY_INVALID", "La moneda del contrato debe ser UF o CLP.", "currency");
  return { startsOn, durationMonths, endsOn: contractEndDate(startsOn, durationMonths), automaticRenewal: input.automaticRenewal !== false, paymentDueDays, currency };
}

// item_type de contract_billable_items según la categoría del catálogo.
export function itemTypeForCategory(category) {
  return ({ FEE: "FEE", SUBSCRIPTION: "FEE", PARKING: "PARKING", DEVICE: "DEVICE", DISCOUNT: "DISCOUNT", OTHER: "OTHER" })[category] || "SERVICE";
}

// Precio propuesto desde el catálogo: solo si la moneda del catálogo coincide con la del contrato.
export function suggestedUnitPrice(concept, contractCurrency) {
  if (!concept || concept.referencePrice == null) return null;
  return concept.referenceCurrency === contractCurrency ? concept.referencePrice : null;
}

export function validateServiceItem(input = {}, { partial = false } = {}) {
  const out = {};
  const has = (key) => !partial || Object.hasOwn(input, key);
  if (!partial) {
    if (!String(input.conceptId || "").trim()) throw new CompanyServiceError("SERVICE_CONCEPT_REQUIRED", "Elige un servicio o producto del catálogo.", "conceptId");
    out.conceptId = String(input.conceptId).trim();
  }
  if (has("description")) {
    const description = String(input.description || "").trim();
    if (description.length < 2 || description.length > 200) throw new CompanyServiceError("SERVICE_DESCRIPTION_INVALID", "La descripción es obligatoria (2 a 200 caracteres).", "description");
    out.description = description;
  }
  if (has("quantity")) out.quantity = parseNumber(input.quantity, { field: "quantity", code: "SERVICE_QUANTITY_INVALID", message: "La cantidad debe ser mayor que cero.", allowZero: false });
  if (has("unitPrice")) out.unitPrice = parseNumber(input.unitPrice, { field: "unitPrice", code: "SERVICE_PRICE_INVALID", message: "El precio debe ser un número mayor o igual a cero." });
  if (has("validFrom")) {
    const validFrom = String(input.validFrom || "").trim();
    if (!isValidDate(validFrom)) throw new CompanyServiceError("SERVICE_FROM_INVALID", "La fecha desde no es válida.", "validFrom");
    out.validFrom = validFrom;
  }
  if (has("validTo")) {
    const validTo = String(input.validTo || "").trim();
    if (validTo && !isValidDate(validTo)) throw new CompanyServiceError("SERVICE_TO_INVALID", "La fecha hasta no es válida.", "validTo");
    out.validTo = validTo || null;
  }
  if (out.validFrom && out.validTo && out.validTo < out.validFrom) throw new CompanyServiceError("SERVICE_TO_INVALID", "La fecha hasta no puede ser anterior a la fecha desde.", "validTo");
  if (has("status") && input.status !== undefined) {
    if (!["ACTIVE", "SUSPENDED", "ENDED"].includes(input.status)) throw new CompanyServiceError("SERVICE_STATUS_INVALID", "Estado no válido.", "status");
    out.status = input.status;
  }
  if (partial && !Object.keys(out).length) throw new CompanyServiceError("SERVICE_NO_CHANGES", "No hay cambios para guardar.");
  return out;
}

// Neto mensual estimado de los servicios activos (en la moneda del contrato), para mostrar en pantalla.
export function monthlyNetEstimate(items, onDate) {
  return Math.round(items
    .filter((item) => item.status === "ACTIVE" && item.validFrom <= onDate && (!item.validTo || item.validTo >= onDate))
    .reduce((sum, item) => sum + (item.itemType === "DISCOUNT" ? -1 : 1) * Number(item.quantity) * Number(item.unitPrice), 0) * 10000) / 10000;
}
