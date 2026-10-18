// Off Street — Pago liberado: tarifas que el ESTACIONAMIENTO cobra a sus
// beneficiarios (SOL-2026-10-05-001). Son independientes del importe único
// de habilitación que ParkFacil cobra al cliente.
//
// - Unidades: HORA, DÍA, MES y AÑO. Una tarifa vigente por unidad y
//   estacionamiento; cambiarla crea una versión nueva (las anteriores no se
//   editan) y nunca altera autorizaciones ya acordadas.
// - Moneda y tributación: se reutilizan las reglas vigentes de las tarifas
//   del estacionamiento (parking_rates): CLP sin decimales, IVA incluido,
//   tasa 19 %, desglose con splitChileTaxFromTotal (src/lib/dataEntry.mjs).
// - Total de una autorización = cantidad × precio por unidad. El término se
//   calcula desde el inicio en la unidad contratada (zonedTime.contractEndMs).
// - "Tarifa configurada" no es "pago recibido": aquí no se registran pagos.

import { splitChileTaxFromTotal } from "../dataEntry.mjs";
import { contractEndMs, RELEASED_PAYMENT_TIME_ZONE } from "./zonedTime.mjs";

export const TARIFF_UNITS = Object.freeze({
  HOUR: Object.freeze({ code: "HOUR", label: "Hora", singular: "hora", plural: "horas", maxQuantity: 8760 }),
  DAY: Object.freeze({ code: "DAY", label: "Día", singular: "día", plural: "días", maxQuantity: 3660 }),
  MONTH: Object.freeze({ code: "MONTH", label: "Mes", singular: "mes", plural: "meses", maxQuantity: 120 }),
  YEAR: Object.freeze({ code: "YEAR", label: "Año", singular: "año", plural: "años", maxQuantity: 10 }),
});
export const TARIFF_UNIT_CODES = Object.freeze(Object.keys(TARIFF_UNITS));

export const TARIFF_CURRENCY = "CLP";
export const TARIFF_VAT_TREATMENT = "INCLUDED";
export const TARIFF_VAT_RATE = 0.19;
export const VAT_TREATMENT_LABELS = Object.freeze({ INCLUDED: "IVA incluido (19 %)" });
export const MAX_TARIFF_PRICE = 1000000000;

export function formatClp(value) {
  return `$${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))}`;
}

export function quantityText(quantity, unitCode) {
  const unit = TARIFF_UNITS[unitCode];
  if (!unit) return String(quantity);
  return `${quantity} ${Number(quantity) === 1 ? unit.singular : unit.plural}`;
}

function parseClp(value) {
  const text = String(value ?? "").trim().replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "");
  if (text === "" || !/^\d+$/.test(text)) return null;
  return Number(text);
}

export function validateTariffInput(input) {
  const errors = [];
  const billingUnit = String(input?.billingUnit || "").trim().toUpperCase();
  if (!TARIFF_UNITS[billingUnit]) errors.push("Selecciona la unidad de la tarifa: hora, día, mes o año.");
  const unitPrice = parseClp(input?.unitPrice);
  if (unitPrice === null || unitPrice > MAX_TARIFF_PRICE) errors.push("Indica el precio por unidad en pesos chilenos, sin decimales.");
  const reason = String(input?.reason || "").trim();
  if (reason.length < 3) errors.push("Indica el motivo del cambio.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { billingUnit, unitPrice, label: String(input?.label || "").trim().slice(0, 80), reason: reason.slice(0, 500) },
  };
}

export function tariffFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    parkingId: row.parking_id,
    companyId: row.company_id,
    billingUnit: row.billing_unit,
    version: row.version,
    currency: row.currency,
    unitPrice: Number(row.unit_price),
    vatTreatment: row.vat_treatment,
    vatRate: Number(row.vat_rate),
    label: row.label || "",
    reason: row.reason,
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at,
    supersededAt: row.superseded_at,
    retired: row.retired === true,
  };
}

// Condiciones acordadas para una autorización: mismo cálculo que la RPC
// released_payment_save_authorization (que es la que las guarda).
export function computeAuthorizationTerms({ tariff, quantity, startsAtMs, timeZone = RELEASED_PAYMENT_TIME_ZONE }) {
  const unit = TARIFF_UNITS[tariff?.billingUnit];
  if (!unit) return { ok: false, errors: ["Selecciona una tarifa vigente."] };
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > unit.maxQuantity) {
    return { ok: false, errors: [`La cantidad debe ser un entero entre 1 y ${unit.maxQuantity} ${unit.plural}.`] };
  }
  if (!Number.isFinite(startsAtMs)) return { ok: false, errors: ["Indica la fecha y hora de inicio."] };
  const total = tariff.unitPrice * qty;
  const { net, tax } = splitChileTaxFromTotal(total, tariff.vatRate ?? TARIFF_VAT_RATE);
  return {
    ok: true,
    value: {
      tariffId: tariff.id,
      tariffVersion: tariff.version,
      billingUnit: unit.code,
      quantity: qty,
      unitPrice: tariff.unitPrice,
      currency: tariff.currency || TARIFF_CURRENCY,
      vatTreatment: tariff.vatTreatment || TARIFF_VAT_TREATMENT,
      vatRate: tariff.vatRate ?? TARIFF_VAT_RATE,
      totalAmount: total,
      netAmount: net,
      taxAmount: tax,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(contractEndMs(startsAtMs, unit.code, qty, timeZone)).toISOString(),
    },
  };
}

// "3 meses × $30.000 = $90.000 (IVA incluido: neto $75.630 + IVA $14.370)"
export function describeTerms(terms) {
  if (!terms || !TARIFF_UNITS[terms.billingUnit]) return "";
  return `${quantityText(terms.quantity, terms.billingUnit)} × ${formatClp(terms.unitPrice)} = ${formatClp(terms.totalAmount)} (IVA incluido: neto ${formatClp(terms.netAmount)} + IVA ${formatClp(terms.taxAmount)})`;
}
