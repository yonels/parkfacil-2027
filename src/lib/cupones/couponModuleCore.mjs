// Cupones y descuentos como módulo contratable (SOL-2026-10-19-002, etapa C).
// Funciones puras compartidas por rutas, menú y pruebas.
//
// Decisiones del usuario (D1–D8, 2026-10-19):
// - D1: se contrata por EMPRESA.
// - D2: importe mensual final en UF + IVA, plazo 12/24/36, versiones inmutables
//   (la validación es la misma de Pago liberado: validateMonthlyFeeInput).
// - D3/D4: ACTIVO = habilitado por Root y contrato vigente hoy. Inactivo: no se
//   emite, envía ni canjea; historial y reportes en solo lectura. Sin
//   contratar: Cupones no aparece para la empresa.
// - D6: COUPONS_ENABLED sigue como resguardo general del ambiente.
// - D8: Root ve contrato e importes; el administrador solo el estado y el término.

export const COUPON_MODULE_STATUS = Object.freeze({
  NOT_CONTRACTED: "NOT_CONTRACTED",
  DISABLED: "DISABLED",
  NOT_STARTED: "NOT_STARTED",
  EXPIRED: "EXPIRED",
  ACTIVE: "ACTIVE",
});

export const COUPON_MODULE_STATUS_LABELS = Object.freeze({
  NOT_CONTRACTED: "No contratado",
  DISABLED: "Contratado, no activo",
  NOT_STARTED: "Contratado, aún no inicia",
  EXPIRED: "Contrato vencido",
  ACTIVE: "Activo",
});

export function contractFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    version: row.version,
    monthlyFeeUf: row.monthly_fee_uf == null ? null : Number(row.monthly_fee_uf),
    baseMonthlyFeeUf: row.base_monthly_fee_uf == null ? null : Number(row.base_monthly_fee_uf),
    discountNotes: row.discount_notes || "",
    termMonths: row.term_months ?? null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    contractReference: row.contract_reference || "",
    crmProposalNumber: row.crm_proposal_number || "",
    notes: row.notes || "",
    reason: row.reason || "",
    createdByEmail: row.created_by_email || "",
    createdAt: row.created_at || null,
    supersededAt: row.superseded_at || null,
  };
}

export function moduleFromDb(row) {
  if (!row) return null;
  return {
    companyId: row.company_id,
    enabled: row.enabled === true,
    currentContractId: row.current_contract_id || null,
    statusChangedAt: row.status_changed_at || null,
    statusReason: row.status_reason || "",
  };
}

export function resolveCouponModuleStatus({ module, contract, now = Date.now() } = {}) {
  const at = new Date(now).getTime();
  if (!module || !contract) return COUPON_MODULE_STATUS.NOT_CONTRACTED;
  if (!module.enabled) return COUPON_MODULE_STATUS.DISABLED;
  if (at < new Date(contract.startsAt).getTime()) return COUPON_MODULE_STATUS.NOT_STARTED;
  if (contract.endsAt && at >= new Date(contract.endsAt).getTime()) return COUPON_MODULE_STATUS.EXPIRED;
  return COUPON_MODULE_STATUS.ACTIVE;
}

export function isCouponModuleActive(status) {
  return status === COUPON_MODULE_STATUS.ACTIVE;
}

// Menú y rutas: la empresa ve Cupones (aunque sea en solo lectura) si alguna
// vez lo contrató. Sin dato (consulta fallida) se trata como no contratado.
export function couponModuleVisible(status) {
  return Boolean(status) && status !== COUPON_MODULE_STATUS.NOT_CONTRACTED;
}

// Lo que ve el administrador (D8): estado y término, sin importes.
export function adminModuleView(status, contract) {
  return {
    status: status || COUPON_MODULE_STATUS.NOT_CONTRACTED,
    label: COUPON_MODULE_STATUS_LABELS[status] || COUPON_MODULE_STATUS_LABELS.NOT_CONTRACTED,
    active: isCouponModuleActive(status),
    endsAt: contract?.endsAt || null,
  };
}

export const COUPON_MODULE_INACTIVE_ERROR = Object.freeze({
  code: "COUPON_MODULE_INACTIVE",
  error: "El módulo de cupones no está activo para esta empresa.",
});

// Mensajes de las RPC Root.
export const COUPON_MODULE_RPC_MESSAGES = Object.freeze({
  COUPON_MODULE_FORBIDDEN: ["Solo ParkFacil Root puede contratar, activar o desactivar el módulo de cupones.", 403],
  COUPON_MODULE_REASON_REQUIRED: ["Indica el motivo del cambio.", 400],
  COUPON_MODULE_FEE_INVALID: ["El importe mensual no es válido.", 400],
  COUPON_MODULE_TERM_INVALID: ["El plazo o la fecha de inicio no son válidos.", 400],
  COUPON_MODULE_COMPANY_INVALID: ["La empresa debe ser un cliente activo con Off Street contratado.", 400],
  COUPON_MODULE_CONTRACT_REQUIRED: ["Primero registra la contratación del módulo.", 409],
  COUPON_MODULE_STATE_UNCHANGED: ["El módulo ya está en ese estado.", 409],
  COUPON_MODULE_CONTRACT_EXPIRED: ["El contrato está vencido. Registra una nueva versión antes de activar.", 409],
  COUPON_MODULE_STATE_INVALID: ["Indica si el módulo se activa o se desactiva.", 400],
  COUPON_MODULE_CATALOG_INVALID: ["Indica si el módulo se ofrece en propuestas.", 400],
  COUPON_MODULE_INACTIVE: [COUPON_MODULE_INACTIVE_ERROR.error, 403],
});

export function couponModuleRpcError(error) {
  const text = `${error?.message || ""} ${error?.details || ""}`;
  const code = Object.keys(COUPON_MODULE_RPC_MESSAGES).find((key) => text.includes(key));
  if (!code) return null;
  const [message, status] = COUPON_MODULE_RPC_MESSAGES[code];
  return { code, message, status };
}
