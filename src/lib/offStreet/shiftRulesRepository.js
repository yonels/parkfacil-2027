// Reglas de turnos por estacionamiento Off Street (SOL-2026-10-29-006). Viven
// en parking_offstreet_settings (misma fila que la foto de patente y el aviso
// de deuda). Sin la migración 20261029190000 las columnas no existen: se
// informan los valores «como hoy» y no se pueden guardar (nunca rompe el POS).
import { DEFAULT_SHIFT_RULES, findHandover, normalizeShiftRules, onDemandStartCheck, openShiftStatus, programmedStartCheck } from "@/lib/pos/shiftRulesCore.mjs";

const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204", "42P01", "PGRST205"]);
const RULE_COLUMNS = "shift_start_window,shift_expired_policy,shift_on_demand_policy";

export async function getShiftRules(db, parkingId) {
  if (!parkingId) return { ...DEFAULT_SHIFT_RULES };
  const { data, error } = await db.from("parking_offstreet_settings").select(RULE_COLUMNS).eq("parking_id", parkingId).maybeSingle();
  if (error) {
    if (MISSING_COLUMN_CODES.has(error.code)) return { ...DEFAULT_SHIFT_RULES };
    throw error;
  }
  return normalizeShiftRules(data);
}

export async function setShiftRules(db, { parkingId, companyId, rules, updatedBy }) {
  const normalized = normalizeShiftRules(rules);
  const { data, error } = await db.from("parking_offstreet_settings").upsert({
    parking_id: parkingId,
    company_id: companyId,
    shift_start_window: normalized.startWindow,
    shift_expired_policy: normalized.expiredPolicy,
    shift_on_demand_policy: normalized.onDemandPolicy,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy || null,
  }, { onConflict: "parking_id" }).select(RULE_COLUMNS).single();
  if (error) {
    if (MISSING_COLUMN_CODES.has(error.code)) {
      throw Object.assign(new Error("SHIFT_RULES_SCHEMA_UNAVAILABLE"), { code: "SHIFT_RULES_SCHEMA_UNAVAILABLE", status: 503 });
    }
    throw error;
  }
  return normalizeShiftRules(data);
}

// ¿Tiene el operador un turno programado hoy en este estacionamiento? (regla 3)
export async function hasProgrammedShiftToday(db, { operatorId, parkingId, today }) {
  const { count, error } = await db.from("operator_shifts").select("id", { count: "exact", head: true })
    .eq("operator_id", operatorId).eq("parking_id", parkingId).eq("status", "PROGRAMMED").eq("shift_date", today);
  if (error) throw error;
  return (count || 0) > 0;
}

// Estado operativo del turno abierto según la regla 2 (con relevo). Solo
// consulta otros turnos si la regla lo necesita.
export async function loadOpenShiftStatus(db, shift, { now = new Date(), rules = null } = {}) {
  if (!shift) return { mode: "OK", expired: false };
  const parkingId = shift.parking_id ?? shift.parkingId;
  const effective = rules || await getShiftRules(db, parkingId);
  const row = { id: shift.id, status: shift.status, shift_date: shift.shift_date ?? shift.date, scheduled_start: shift.scheduled_start ?? shift.scheduledStart, scheduled_end: shift.scheduled_end ?? shift.scheduledEnd };
  const base = openShiftStatus(effective, row, { now });
  if (base.mode !== "COLLECT_ONLY") return { ...base, rules: effective };
  const others = await db.from("operator_shifts").select("id,operator_id,status,shift_date,scheduled_start,scheduled_end")
    .eq("parking_id", parkingId).in("status", ["PROGRAMMED", "OPEN"]).neq("id", shift.id).gte("shift_date", row.shift_date);
  if (others.error) throw others.error;
  const handover = findHandover(row, others.data || [], now);
  if (!handover) return { ...base, rules: effective };
  const member = await db.from("company_members").select("full_name").eq("user_id", handover.operator_id).maybeSingle();
  return { ...openShiftStatus(effective, row, { now, handover, handoverOperatorName: member.data?.full_name || "" }), rules: effective };
}

// «Iniciar turno» en un estacionamiento (reglas 1 y 3): el POS reutiliza el
// turno programado de hoy si existe (ensureOnDemandProgrammedShift), así que
// se aplica el margen de inicio a ese turno; si no existe, es un turno a pedido.
export async function startRuleCheck(db, { parkingId, operatorId, today, now = new Date(), rules = null }) {
  const effective = rules || await getShiftRules(db, parkingId);
  const programmed = await db.from("operator_shifts").select("id,shift_date,scheduled_start,scheduled_end")
    .eq("operator_id", operatorId).eq("parking_id", parkingId).eq("status", "PROGRAMMED").eq("shift_date", today)
    .order("scheduled_start", { ascending: true }).limit(1).maybeSingle();
  if (programmed.error) throw programmed.error;
  if (programmed.data) return { ...programmedStartCheck(effective, programmed.data, now), kind: "PROGRAMMED", shiftId: programmed.data.id };
  return { ...onDemandStartCheck(effective, { hasProgrammedToday: false }), kind: "ON_DEMAND" };
}
