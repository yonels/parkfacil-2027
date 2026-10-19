// Estado del módulo Cupones por empresa (SOL-2026-10-19-002, etapa C), leído
// server-side con service_role. Sin las migraciones de la etapa C la empresa
// se trata como NO contratada (storageReady: false).
import { couponsEnabled } from "./couponsAvailability.mjs";
import { adminModuleView, contractFromDb, COUPON_MODULE_STATUS, isCouponModuleActive, moduleFromDb, resolveCouponModuleStatus } from "./couponModuleCore.mjs";

const STORAGE_MISSING = new Set(["42P01", "PGRST205", "PGRST200", "42883", "PGRST202"]);

export async function loadCouponModuleState(db, companyId, { now = Date.now() } = {}) {
  if (!companyId) return { status: COUPON_MODULE_STATUS.NOT_CONTRACTED, active: false, module: null, contract: null, storageReady: true };
  const moduleResult = await db.from("coupon_company_modules").select("*").eq("company_id", companyId).maybeSingle();
  if (moduleResult.error) {
    if (STORAGE_MISSING.has(moduleResult.error.code)) return { status: COUPON_MODULE_STATUS.NOT_CONTRACTED, active: false, module: null, contract: null, storageReady: false };
    throw moduleResult.error;
  }
  const moduleRow = moduleFromDb(moduleResult.data);
  let contract = null;
  if (moduleRow?.currentContractId) {
    const contractResult = await db.from("coupon_module_contracts").select("*").eq("id", moduleRow.currentContractId).maybeSingle();
    if (contractResult.error) throw contractResult.error;
    contract = contractFromDb(contractResult.data);
  }
  const status = resolveCouponModuleStatus({ module: moduleRow, contract, now });
  return { status, active: isCouponModuleActive(status), module: moduleRow, contract, storageReady: true };
}

// Resguardo de ambiente (D6) + módulo activo de la empresa.
export async function couponsActiveForCompany(db, companyId) {
  if (!couponsEnabled()) return false;
  try {
    return (await loadCouponModuleState(db, companyId)).active;
  } catch {
    return false;
  }
}

// Lo mismo a partir de un estacionamiento (POS, cálculo y cobro con cupón).
export async function couponsActiveForParking(db, parkingId) {
  if (!couponsEnabled() || !parkingId) return false;
  try {
    const { data, error } = await db.from("parkings").select("company_id").eq("id", parkingId).maybeSingle();
    if (error || !data?.company_id) return false;
    return (await loadCouponModuleState(db, data.company_id)).active;
  } catch {
    return false;
  }
}

// Estado para la sesión (menú/proxy): nunca rompe el ingreso.
export async function couponModuleStatusForSession(db, companyId) {
  try {
    return (await loadCouponModuleState(db, companyId)).status;
  } catch {
    return COUPON_MODULE_STATUS.NOT_CONTRACTED;
  }
}

export { adminModuleView };
