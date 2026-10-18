// Off Street — Pago liberado: contratación por estacionamiento, exclusiva
// de Root (SOL-2026-10-05-002). ParkFacil cobra un importe MENSUAL
// configurable + IVA por el módulo, independiente de cupos, patentes,
// beneficiarios y de las tarifas que el cliente cobra a sus beneficiarios.
// Root registra el importe mensual FINAL acordado (después de los descuentos
// de la propuesta; debe coincidir con el CRM), el plazo contractual (12, 24 o
// 36 meses) y la fecha de inicio; el término es inicio + plazo en meses
// calendario. Base, descuentos y propuesta CRM se guardan cuando estén
// disponibles. Sin prorrateos ni renovaciones automáticas: extender es una
// nueva versión. Los cupos los define el cliente. Contratar no activa.
//
// Una propuesta = un estacionamiento (decisión del usuario, 2026-10-16): cada
// estacionamiento guarda su contratación; nada suma ni multiplica importes.

import { MONTHLY_FEE_MODALITY } from "./catalogCore.mjs";
import { contractEndMs, formatLocalDateTime, parseLocalDate, RELEASED_PAYMENT_TIME_ZONE, zonedLocalToUtc } from "./zonedTime.mjs";

const MAX_FEE_UF = 100000;
export const CONTRACT_TERMS_MONTHS = Object.freeze([12, 24, 36]);

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseUf(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_FEE_UF || Math.abs(Math.round(n * 100) - n * 100) > 1e-8) return NaN;
  return round2(n);
}

export function validateMonthlyFeeInput(input, { timeZone = RELEASED_PAYMENT_TIME_ZONE } = {}) {
  const errors = [];
  const fee = parseUf(input?.monthlyFeeUf);
  if (fee === null || Number.isNaN(fee)) {
    errors.push("Indica el importe mensual final del módulo en UF (después de descuentos; mayor o igual a 0, máximo dos decimales).");
  }
  const base = parseUf(input?.baseMonthlyFeeUf);
  if (Number.isNaN(base)) errors.push("El importe mensual base debe estar en UF, con máximo dos decimales.");
  else if (base !== null && fee !== null && !Number.isNaN(fee) && base < fee) errors.push("El importe base no puede ser menor que el importe mensual final.");
  const termMonths = Number(input?.termMonths);
  if (!CONTRACT_TERMS_MONTHS.includes(termMonths)) errors.push("Selecciona el plazo contractual: 12, 24 o 36 meses.");
  const startDate = parseLocalDate(input?.startsAt);
  if (!startDate) errors.push("Indica la fecha de inicio del contrato.");
  const reason = String(input?.reason || "").trim();
  if (reason.length < 3) errors.push("Indica el motivo del cambio.");
  if (errors.length) return { ok: false, errors };
  const startsAtMs = zonedLocalToUtc(startDate, timeZone);
  return {
    ok: true,
    value: {
      monthlyFeeUf: fee,
      baseMonthlyFeeUf: base,
      discountNotes: String(input?.discountNotes || "").trim().slice(0, 300),
      termMonths,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(contractEndMs(startsAtMs, "MONTH", termMonths, timeZone)).toISOString(),
      contractReference: String(input?.contractReference || "").trim().slice(0, 120),
      crmProposalNumber: String(input?.crmProposalNumber || "").trim().slice(0, 60),
      notes: String(input?.notes || "").trim().slice(0, 500),
      reason: reason.slice(0, 500),
    },
  };
}

export function formatUf(value) {
  return `${new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} UF`;
}

export function isMonthlyFeeContract(contract) {
  return contract?.modality === MONTHLY_FEE_MODALITY;
}

export function contractPeriodText(contract, timeZone = RELEASED_PAYMENT_TIME_ZONE) {
  if (!contract?.endsAt) return "";
  return `${formatLocalDateTime(contract.startsAt, timeZone).slice(0, 10)} a ${formatLocalDateTime(contract.endsAt, timeZone).slice(0, 10)}`;
}

export function describeContract(contract) {
  if (!contract) return "";
  const fee = `${formatUf(contract.monthlyFeeUf ?? contract.totalUf)} + IVA mensual`;
  const base = contract.baseMonthlyFeeUf !== null && contract.baseMonthlyFeeUf !== undefined && contract.baseMonthlyFeeUf > contract.monthlyFeeUf
    ? ` (base ${formatUf(contract.baseMonthlyFeeUf)}, descuento ${formatUf(contract.baseMonthlyFeeUf - contract.monthlyFeeUf)})`
    : "";
  return `Importe mensual final: ${fee}${base} · plazo ${contract.termMonths} meses`;
}
