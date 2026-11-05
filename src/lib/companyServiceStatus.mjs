// Activar o desactivar una empresa desde Root (SOL-2026-11-04-013).
export const COMPANY_SUSPENSION_REASONS = Object.freeze([
  { code: "UNPAID_INVOICES", label: "Facturas impagas" },
  { code: "PLATFORM_MISUSE", label: "Mal uso de la plataforma" },
  { code: "RULES_BREACH", label: "Incumplimiento de las normas" },
  { code: "OTHER", label: "Otro motivo" },
]);

export const COMPANY_REASON_LABELS = Object.freeze({
  ...Object.fromEntries(COMPANY_SUSPENSION_REASONS.map((item) => [item.code, item.label])),
  REACTIVATION: "Reactivación",
});

export const PUBLIC_SERVICE_UNAVAILABLE_MESSAGE = "Este servicio no está disponible en este momento.";

const clean = (value) => String(value ?? "").trim();

export function canManageCompanyStatus(company) {
  return company?.tipoRelacion === "client" && ["active", "inactive"].includes(company?.estado);
}

// Devuelve el cambio listo para guardar, o el error que se muestra a Root.
export function validateCompanyStatusChange({ status, reasonCode, detail } = {}) {
  const reasonDetail = clean(detail);
  if (reasonDetail.length > 500) return { error: "El detalle admite hasta 500 caracteres." };
  if (status === "inactive") {
    if (!COMPANY_SUSPENSION_REASONS.some((item) => item.code === reasonCode)) return { error: "Selecciona el motivo de la desactivación." };
    if (reasonCode === "OTHER" && reasonDetail.length < 5) return { error: "Describe el motivo de la desactivación." };
    return { status, reasonCode, reasonDetail };
  }
  if (status === "active") {
    if (reasonDetail.length < 5) return { error: "Describe por qué se reactiva la empresa." };
    return { status, reasonCode: "REACTIVATION", reasonDetail };
  }
  return { error: "El estado solicitado no es válido." };
}

// El estado se cambia solo con motivo y registro: el formulario de edición no puede
// desactivar ni reactivar, y sí puede pasar entre «En implementación» y «Activa».
export function companyStatusFromEditForm(currentStatus, requested) {
  if (currentStatus === "inactive" || requested === "inactive") return currentStatus;
  return requested;
}

// Solo una desactivación explícita apaga los servicios públicos.
export async function isParkingCompanyActive(db, parkingId) {
  const result = await db.from("parkings").select("company:companies(status)").eq("id", parkingId).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.company?.status !== "inactive";
}

export async function isStayCompanyActive(db, stayId) {
  const result = await db.from("parking_stays").select("parking_id").eq("id", stayId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? isParkingCompanyActive(db, result.data.parking_id) : true;
}

export async function isSessionCompanyActive(db, sessionId) {
  const result = await db.from("on_street_pilot_sessions").select("parking_id").eq("id", sessionId).maybeSingle();
  if (result.error) throw result.error;
  return result.data ? isParkingCompanyActive(db, result.data.parking_id) : true;
}
