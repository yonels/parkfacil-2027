export const PREINVOICE_STATUSES = Object.freeze(["DRAFT", "CALCULATED", "UNDER_REVIEW", "APPROVED", "READY_TO_ISSUE", "CANCELLED"]);

export class BillingValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BillingValidationError";
    this.code = code;
    this.details = details;
  }
}

export function parseBillingPeriod(period) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(period || ""))) throw new BillingValidationError("INVALID_PERIOD", "El periodo debe usar formato YYYY-MM.");
  const [year, month] = period.split("-").map(Number);
  const from = `${period}-01`;
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { period, from, to };
}

export function overlapsPeriod(item, range) {
  return item.validFrom <= range.to && (!item.validTo || item.validTo >= range.from);
}

export function preinvoiceSourceKey(item, period) {
  return [item.contractItemId, item.conceptId, item.deviceId || item.parkingId || "contract", period].join(":");
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export async function calculatePreinvoice({ contract, items, period, ufRateService, ufDate, taxResolver = () => 0 }) {
  const range = parseBillingPeriod(period);
  if (!contract?.id || !contract?.companyId) throw new BillingValidationError("CONTRACT_REQUIRED", "Contrato invalido.");
  if (!overlapsPeriod({ validFrom: contract.startsOn, validTo: contract.endsOn }, range)) throw new BillingValidationError("CONTRACT_OUT_OF_PERIOD", "El contrato no esta vigente en el periodo.");

  const activeItems = (items || []).filter((item) => item.status === "ACTIVE" && overlapsPeriod(item, range));
  if (!activeItems.length) throw new BillingValidationError("CONTRACT_ITEMS_MISSING", "El contrato no posee items facturables vigentes.");
  const currencies = new Set(activeItems.map((item) => item.currency));
  if (currencies.size !== 1 || !currencies.has(contract.currency)) throw new BillingValidationError("MIXED_CONTRACT_CURRENCY", "Los items deben usar la moneda contractual.");

  const chargeable = activeItems.filter((item) => item.classification === "ADDITIONAL" || item.itemType !== "DEVICE");
  const lines = chargeable.map((item) => {
    const quantity = item.itemType === "DISCOUNT" ? Number(item.quantity) : Math.max(0, Number(item.quantity) - Number(item.includedQuantity || 0));
    const sign = item.itemType === "DISCOUNT" ? -1 : 1;
    const subtotal = round(sign * quantity * Number(item.unitPrice));
    const taxAmount = round(Number(taxResolver(item, subtotal) || 0));
    return {
      companyId: contract.companyId,
      conceptId: item.conceptId,
      contractItemId: item.contractItemId,
      parkingId: item.parkingId || null,
      deviceId: item.deviceId || null,
      sourceType: item.deviceId ? "DEVICE" : item.parkingId ? "PARKING" : item.itemType === "SERVICE" ? "SERVICE" : "CONTRACT",
      sourceKey: preinvoiceSourceKey(item, period),
      description: item.description,
      quantity, unit: item.unit, unitPrice: Number(item.unitPrice), currency: item.currency,
      subtotal, taxAmount, totalAmount: round(subtotal + taxAmount), validFrom: range.from, validTo: range.to,
    };
  }).filter((line) => line.quantity > 0 || line.subtotal !== 0);

  const netAmount = round(lines.reduce((sum, line) => sum + line.subtotal, 0));
  const taxAmount = round(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  const totalAmount = round(netAmount + taxAmount);
  const result = { period, range, currency: contract.currency, lines, netAmount, taxAmount, totalAmount, uf: null };

  if (contract.currency === "UF") {
    if (!ufDate) throw new BillingValidationError("UF_DATE_RULE_MISSING", "No se ha configurado la fecha comercial para la UF.");
    let rate;
    try { rate = await ufRateService.getUfByDate(ufDate); }
    catch (cause) { throw new BillingValidationError("UF_RATE_UNAVAILABLE", "No fue posible obtener la UF oficial.", { ufDate, cause: cause?.code || "UF_SERVICE_ERROR" }); }
    if (!rate?.value || rate.value <= 0) throw new BillingValidationError("UF_RATE_UNAVAILABLE", "La respuesta oficial no contiene una UF valida.", { ufDate });
    result.uf = { date: rate.date || ufDate, value: Number(rate.value), source: "Banco Central de Chile", convertedAmountClp: round(totalAmount * Number(rate.value), 2) };
  }
  return result;
}
