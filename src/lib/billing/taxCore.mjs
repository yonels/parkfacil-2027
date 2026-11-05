// IVA y conversión UF → CLP de ParkFacil (SOL-2026-11-05-005, F1.3).
// Regla (D2): precios en UF neto + IVA; la factura se emite en pesos con la UF del día de facturación.
// Orden de cálculo (igual a la factura N° 278 de EasyDoc): neto afecto en CLP = redondeo(neto UF × UF);
// IVA = redondeo(neto afecto CLP × 19 %); total = neto afecto + exento + IVA. Ej.: 61.871 → IVA 11.755 → 73.626.

export const CHILE_VAT_RATE = 0.19;

export class TaxClassificationError extends Error {
  constructor(message = "Existen servicios sin clasificación tributaria (afecto o exento).") {
    super(message);
    this.name = "TaxClassificationError";
    this.code = "TAX_CLASSIFICATION_REQUIRED";
  }
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function decimalsFor(currency) {
  return currency === "CLP" ? 0 : 4;
}

// Separa el neto afecto y el exento. Exige que cada línea tenga clasificación tributaria.
export function splitNetByTax(lines) {
  let taxableNet = 0;
  let exemptNet = 0;
  for (const line of lines || []) {
    const category = line.taxCategory;
    if (category !== "TAXABLE" && category !== "EXEMPT") throw new TaxClassificationError();
    if (category === "TAXABLE") taxableNet += Number(line.net);
    else exemptNet += Number(line.net);
  }
  return { taxableNet, exemptNet };
}

// Totales en pesos a partir del neto (en la moneda del contrato) y el valor de la UF (1 si ya está en CLP).
export function clpTotals({ taxableNet, exemptNet, ufValue = 1 }) {
  const taxableClp = Math.round(Number(taxableNet) * Number(ufValue));
  const exemptClp = Math.round(Number(exemptNet) * Number(ufValue));
  const taxClp = Math.round(taxableClp * CHILE_VAT_RATE);
  return { taxableClp, exemptClp, netClp: taxableClp + exemptClp, taxClp, totalClp: taxableClp + exemptClp + taxClp };
}

// Totales de la prefactura en la moneda del contrato (para mostrar) + equivalente en pesos.
export function preinvoiceTotals(lines, currency) {
  const decimals = decimalsFor(currency);
  const { taxableNet, exemptNet } = splitNetByTax(lines);
  const netAmount = round(taxableNet + exemptNet, decimals);
  const taxAmount = round(taxableNet * CHILE_VAT_RATE, decimals);
  return { taxableNet: round(taxableNet, decimals), exemptNet: round(exemptNet, decimals), netAmount, taxAmount, totalAmount: round(netAmount + taxAmount, decimals) };
}

export function lineTax(line, currency) {
  return line.taxCategory === "TAXABLE" ? round(Number(line.net) * CHILE_VAT_RATE, decimalsFor(currency)) : 0;
}

// Montos definitivos de la factura (siempre en pesos). ufValue solo para contratos en UF.
// Cada línea se convierte y redondea a pesos (como la guarda la base, migración 20261105233000); el neto es la
// suma de las líneas redondeadas y el IVA se calcula sobre el neto afecto en pesos.
export function definitiveInvoiceAmounts({ currency, lines, ufValue = null }) {
  splitNetByTax(lines);
  const factor = currency === "UF" ? Number(ufValue) : 1;
  let taxableClp = 0;
  let exemptClp = 0;
  for (const line of lines) {
    const amount = Math.round(Number(line.net) * factor);
    if (line.taxCategory === "TAXABLE") taxableClp += amount; else exemptClp += amount;
  }
  const tax = Math.round(taxableClp * CHILE_VAT_RATE);
  return { currency: "CLP", net: taxableClp + exemptClp, exempt: exemptClp, tax, total: taxableClp + exemptClp + tax };
}
