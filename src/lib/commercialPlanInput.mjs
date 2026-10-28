// Planes comerciales (2026-10-28): validación y mapeo compartidos por
// POST /api/planes (crear) y PATCH /api/planes/[id] (editar, archivar,
// reactivar). Sin dependencias de Next ni Supabase: se prueba con node --test.
export const PLAN_ALLOWED = Object.freeze({
  status: ["active", "inactive", "draft", "archived"],
  type: ["monthly_subscription", "per_transaction", "per_parking", "equipment_bundle", "implementation_only", "custom"],
  currency: ["CLP", "UF", "USD"],
  billingMode: ["monthly", "annual", "one_time", "per_transaction", "mixed"],
});

const NUMERIC = ["monthlyFee", "annualFee", "implementationFee", "transactionFee", "deviceFee", "parkingFee", "supportFee", "discountPercentage", "minimumMonthlyCharge", "includedParkings", "includedDevices", "includedUsers"];

const text = (value) => String(value || "").trim();
const number = (value) => Number(value || 0);
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : text(value).split(",").map(text).filter(Boolean);

// Devuelve { ok: true, row } con las columnas editables (nunca code ni
// created_by) o { ok: false, error }.
export function validarPlanInput(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "Revisa los datos obligatorios y valores del plan." };
  const invalido = !text(input.name)
    || !PLAN_ALLOWED.status.includes(input.status)
    || !PLAN_ALLOWED.type.includes(input.type)
    || !PLAN_ALLOWED.currency.includes(input.currency)
    || !PLAN_ALLOWED.billingMode.includes(input.billingMode)
    || NUMERIC.some((key) => !Number.isFinite(number(input[key])) || number(input[key]) < 0)
    || number(input.discountPercentage) > 100;
  if (invalido) return { ok: false, error: "Revisa los datos obligatorios y valores del plan." };
  return {
    ok: true,
    row: {
      name: text(input.name), description: text(input.description), status: input.status, type: input.type,
      currency: input.currency, billing_mode: input.billingMode, monthly_fee: number(input.monthlyFee),
      annual_fee: number(input.annualFee), implementation_fee: number(input.implementationFee),
      transaction_fee: number(input.transactionFee), device_fee: number(input.deviceFee),
      parking_fee: number(input.parkingFee), support_fee: number(input.supportFee),
      discount_percentage: number(input.discountPercentage), minimum_monthly_charge: number(input.minimumMonthlyCharge),
      included_parkings: number(input.includedParkings), included_devices: number(input.includedDevices),
      included_users: number(input.includedUsers), modules: list(input.modules), equipment: list(input.equipment),
      notes: text(input.notes),
    },
  };
}

export function mapPlan(row) {
  return { id: row.id, codigo: row.code, nombre: row.name, descripcion: row.description, estado: row.status, tipo: row.type, moneda: row.currency, modalidadCobro: row.billing_mode, monthlyFee: Number(row.monthly_fee), annualFee: Number(row.annual_fee), implementationFee: Number(row.implementation_fee), transactionFee: Number(row.transaction_fee), deviceFee: Number(row.device_fee), parkingFee: Number(row.parking_fee), supportFee: Number(row.support_fee), discountPercentage: Number(row.discount_percentage), minimumMonthlyCharge: Number(row.minimum_monthly_charge), estacionamientosIncluidos: row.included_parkings, dispositivosIncluidos: row.included_devices, usuariosIncluidos: row.included_users, modulos: row.modules || [], equipamiento: row.equipment || [], limites: [], soporte: [], implementacion: [], capacitacion: [], reportes: [], integraciones: [], condiciones: [], vigencia: "Sin vigencia definida", fechaCreacion: row.created_at?.slice(0, 10), contractIds: [], observaciones: row.notes || row.description, notas: row.notes || "", updatedAt: row.updated_at };
}

// Valores del formulario a partir de un plan ya mapeado (modo edición).
export function formularioDesdePlan(plan) {
  const valor = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    name: plan.nombre || "", description: plan.descripcion || "", status: plan.estado, type: plan.tipo,
    currency: plan.moneda, billingMode: plan.modalidadCobro, monthlyFee: valor(plan.monthlyFee),
    annualFee: valor(plan.annualFee), implementationFee: valor(plan.implementationFee),
    transactionFee: valor(plan.transactionFee), deviceFee: valor(plan.deviceFee), parkingFee: valor(plan.parkingFee),
    supportFee: valor(plan.supportFee), discountPercentage: valor(plan.discountPercentage),
    minimumMonthlyCharge: valor(plan.minimumMonthlyCharge), includedParkings: valor(plan.estacionamientosIncluidos),
    includedDevices: valor(plan.dispositivosIncluidos), includedUsers: valor(plan.usuariosIncluidos),
    modules: (plan.modulos || []).join(", "), equipment: (plan.equipamiento || []).join(", "), notes: plan.notas || "",
  };
}
