// Off Street — Pago liberado (Fases B/D): estado del módulo por
// estacionamiento, elegibilidad de un ingreso con beneficio y tiempo
// cubierto a la salida. Puro (sin red), compartido por rutas, POS y pruebas.
//
// - Solo un módulo HABILITADO por Root y con contratación vigente admite
//   nuevos ingresos con beneficio. Desactivado, vencido o sin iniciar: la
//   patente ingresa con cobro normal (el beneficio no aplica) y se informa.
//   El fee mensual (SOL-2026-10-05-002) y el cobro único anterior no vencen;
//   solo una versión periódica anterior conserva su término.
// - Los cupos simultáneos los define el cliente por estacionamiento
//   (module.operationalSpots); la contratación ya no los limita.
// - Ingreso con beneficio: la patente tiene una autorización ACTIVA cuya
//   vigencia incluye el instante del ingreso, y hay cupo simultáneo.
// - Al ingresar se congelan las condiciones (autorizaciones, vigencia de la
//   contratación, zona horaria): la salida usa SOLO ese snapshot, así que
//   desactivar, vencer o modificar después no genera cobros retroactivos.
// - Fuera de la autorización se cobra con la tarifa normal del
//   estacionamiento sobre el tiempo no cubierto (Ley 20.967, sin redondeo).

import { coveredSecondsBetween, isAuthorizationCurrent } from "./authorizationCore.mjs";
import { RELEASED_PAYMENT_TIME_ZONE } from "./zonedTime.mjs";

export const MODULE_STATUS = Object.freeze({
  NOT_CONTRACTED: "NOT_CONTRACTED",
  DISABLED: "DISABLED",
  NOT_STARTED: "NOT_STARTED",
  EXPIRED: "EXPIRED",
  ACTIVE: "ACTIVE",
});

export const MODULE_STATUS_LABELS = Object.freeze({
  NOT_CONTRACTED: "Sin contratación",
  DISABLED: "Módulo desactivado",
  NOT_STARTED: "Contratación aún no vigente",
  EXPIRED: "Contratación vencida",
  ACTIVE: "Módulo activo",
});

export function contractFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    parkingId: row.parking_id,
    companyId: row.company_id,
    version: row.version,
    modality: row.modality,
    billingUnit: row.billing_unit,
    unitQuantity: row.unit_quantity,
    periodQuantity: row.period_quantity,
    pricePerPeriodUf: Number(row.price_per_period_uf),
    totalUf: Number(row.total_uf),
    monthlyFeeUf: row.monthly_fee_uf === null || row.monthly_fee_uf === undefined ? null : Number(row.monthly_fee_uf),
    baseMonthlyFeeUf: row.base_monthly_fee_uf === null || row.base_monthly_fee_uf === undefined ? null : Number(row.base_monthly_fee_uf),
    discountNotes: row.discount_notes || "",
    termMonths: row.term_months ?? null,
    contractReference: row.contract_reference || "",
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? null,
    timeZone: row.time_zone || RELEASED_PAYMENT_TIME_ZONE,
    crmProposalNumber: row.crm_proposal_number || "",
    notes: row.notes || "",
    reason: row.reason,
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at,
    supersededAt: row.superseded_at,
  };
}

export function moduleFromDb(row) {
  if (!row) return null;
  return {
    parkingId: row.parking_id,
    companyId: row.company_id,
    enabled: row.enabled === true,
    currentContractId: row.current_contract_id,
    // Cupos simultáneos definidos por el cliente (null = sin configurar).
    operationalSpots: row.operational_spots === null || row.operational_spots === undefined ? null : Number(row.operational_spots),
    statusChangedAt: row.status_changed_at,
    statusReason: row.status_reason || "",
  };
}

export function resolveModuleStatus({ module, contract, now = Date.now() }) {
  const at = new Date(now).getTime();
  if (!module || !contract) return MODULE_STATUS.NOT_CONTRACTED;
  if (!module.enabled) return MODULE_STATUS.DISABLED;
  if (at < new Date(contract.startsAt).getTime()) return MODULE_STATUS.NOT_STARTED;
  if (contract.endsAt && at >= new Date(contract.endsAt).getTime()) return MODULE_STATUS.EXPIRED;
  return MODULE_STATUS.ACTIVE;
}

export const ENTRY_DECISION = Object.freeze({
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  ELIGIBLE: "ELIGIBLE",
  MODULE_UNAVAILABLE: "MODULE_UNAVAILABLE",
  AUTHORIZATION_NOT_CURRENT: "AUTHORIZATION_NOT_CURRENT",
  NO_SPOTS: "NO_SPOTS",
});

/**
 * Decide si un ingreso se registra como "Patente liberada".
 * `authorizations`: autorizaciones de la patente en ESTE estacionamiento.
 */
export function evaluateReleasedEntry({ module, contract, authorizations = [], openReleasedStays = 0, now = Date.now() }) {
  const active = authorizations.filter((item) => item.status === "ACTIVE");
  if (!active.length) return { decision: ENTRY_DECISION.NOT_AUTHORIZED };
  const moduleStatus = resolveModuleStatus({ module, contract, now });
  const spots = { used: openReleasedStays, total: module?.operationalSpots ?? 0 };
  if (moduleStatus !== MODULE_STATUS.ACTIVE) {
    return { decision: ENTRY_DECISION.MODULE_UNAVAILABLE, moduleStatus, message: `${MODULE_STATUS_LABELS[moduleStatus]}: la patente ingresa con cobro normal.` };
  }
  const current = active.filter((item) => isAuthorizationCurrent(item, now));
  if (!current.length) {
    return { decision: ENTRY_DECISION.AUTHORIZATION_NOT_CURRENT, moduleStatus, message: "La autorización de esta patente no está vigente ahora: ingresa con cobro normal." };
  }
  if (openReleasedStays >= spots.total) {
    return { decision: ENTRY_DECISION.NO_SPOTS, moduleStatus, spots, message: `Sin cupos liberados disponibles (${spots.used} de ${spots.total} en uso): ingresa con cobro normal o espera la salida de otra patente liberada.` };
  }
  // Primaria: la vigente que termina más tarde (la RPC re-verifica su vigencia).
  const primary = [...current].sort((a, b) => new Date(b.validTo).getTime() - new Date(a.validTo).getTime())[0];
  return {
    decision: ENTRY_DECISION.ELIGIBLE,
    moduleStatus,
    spots,
    authorization: primary,
    snapshot: buildReleasedEntrySnapshot({ authorizations: active, contract, operationalSpots: spots.total, now }),
  };
}

// Condiciones congeladas al ingreso. Incluye todas las autorizaciones
// activas de la patente en el estacionamiento (unión, sin duplicar).
export function buildReleasedEntrySnapshot({ authorizations, contract, operationalSpots = null, now = Date.now() }) {
  return {
    version: 3,
    capturedAt: new Date(now).toISOString(),
    timeZone: contract?.timeZone || RELEASED_PAYMENT_TIME_ZONE,
    contract: { id: contract.id, version: contract.version, modality: contract.modality ?? null, startsAt: contract.startsAt, endsAt: contract.endsAt },
    operationalSpots,
    authorizations: authorizations.map((item) => ({
      id: item.id,
      kind: item.kind,
      validFrom: item.validFrom,
      validTo: item.validTo,
      schedule: item.schedule || [],
      version: item.version,
      // Copia de lo acordado con el beneficiario (null en autorizaciones
      // anteriores sin condiciones comerciales). Solo trazabilidad.
      terms: item.terms ? { billingUnit: item.terms.billingUnit, quantity: item.terms.quantity, unitPrice: item.terms.unitPrice, totalAmount: item.terms.totalAmount, tariffVersion: item.terms.tariffVersion } : null,
    })),
  };
}

// Tiempo transcurrido, cubierto y cobrable para una estadía liberada,
// usando solo el snapshot del ingreso. La cobertura termina, a más tardar,
// al fin de la contratación vigente al ingreso.
export function releasedStayCoverage(snapshot, entryAt, exitAt) {
  const elapsedSeconds = Math.max(0, Math.floor((new Date(exitAt).getTime() - new Date(entryAt).getTime()) / 1000));
  const limitMs = snapshot?.contract?.endsAt ? new Date(snapshot.contract.endsAt).getTime() : null;
  const coveredSeconds = Math.min(elapsedSeconds, coveredSecondsBetween(snapshot?.authorizations || [], entryAt, exitAt, {
    timeZone: snapshot?.timeZone || RELEASED_PAYMENT_TIME_ZONE,
    limitMs,
  }));
  return { elapsedSeconds, coveredSeconds, chargeableSeconds: elapsedSeconds - coveredSeconds };
}
