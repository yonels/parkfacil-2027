// Aviso de deuda pendiente por estacionamiento (SOL-2026-10-08-003, D6/D7).
// Vive en parking_offstreet_settings (misma fila que la foto de patente). Sin
// la migración 20261008100000 la columna no existe: se informa desactivado y
// no se puede activar (nunca rompe el ingreso).

const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204", "42P01", "PGRST205"]);

export async function getDebtNoticeEnabled(db, parkingId) {
  if (!parkingId) return false;
  const { data, error } = await db.from("parking_offstreet_settings").select("debt_notice_enabled").eq("parking_id", parkingId).maybeSingle();
  if (error) {
    if (MISSING_COLUMN_CODES.has(error.code)) return false;
    throw error;
  }
  return data?.debt_notice_enabled === true;
}

export async function setDebtNoticeEnabled(db, { parkingId, companyId, enabled, updatedBy }) {
  if (!parkingId || !companyId) {
    throw Object.assign(new Error("DEBT_NOTICE_MISSING_SCOPE"), { code: "DEBT_NOTICE_MISSING_SCOPE", status: 400 });
  }
  if (typeof enabled !== "boolean") {
    throw Object.assign(new Error("DEBT_NOTICE_INVALID"), { code: "DEBT_NOTICE_INVALID", status: 400 });
  }
  const { data, error } = await db.from("parking_offstreet_settings").upsert({
    parking_id: parkingId,
    company_id: companyId,
    debt_notice_enabled: enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || null,
  }, { onConflict: "parking_id" }).select("debt_notice_enabled").single();
  if (error) {
    if (MISSING_COLUMN_CODES.has(error.code)) {
      throw Object.assign(new Error("DEBT_NOTICE_SCHEMA_UNAVAILABLE"), { code: "DEBT_NOTICE_SCHEMA_UNAVAILABLE", status: 503 });
    }
    throw error;
  }
  return data.debt_notice_enabled === true;
}
