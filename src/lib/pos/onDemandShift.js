import { ensureOffStreetAssignment } from "@/lib/pos/offStreetAssignment";
import { chileOperationalDate } from "@/lib/posOperatorShiftService";

// Inicio de turno a pedido (decisión de negocio 2026-09-28): si el operador
// no tiene un turno programado hoy en su estacionamiento, el POS puede crearlo
// en el momento. Deja un turno PROGRAMMED de hoy (00:00–23:59) igual al que
// crea la programación de turnos, para que se abra con el mismo RPC
// start_operator_shift (que vuelve a validar dueño/estado bajo bloqueo).
// Idempotente: si ya existe un PROGRAMMED de hoy lo reutiliza (doble toque).
// Solo Off Street: On Street exige una asignación de calle explícita.
export const ON_DEMAND_SHIFT_NOTE = "ON_DEMAND_POS";

export class OnDemandShiftError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function ensureOnDemandProgrammedShift(db, { parking, operatorId, now = new Date() }) {
  if (!parking?.id || !operatorId) throw new OnDemandShiftError("PARKING_UNASSIGNED", "No tienes un estacionamiento asignado.");
  if (parking.status && parking.status !== "ACTIVE") throw new OnDemandShiftError("PARKING_NOT_ACTIVE", "El estacionamiento no está activo.");
  if (parking.type !== "OFF_STREET") {
    throw new OnDemandShiftError("ON_DEMAND_SHIFT_NOT_SUPPORTED", "Este estacionamiento requiere un turno programado por tu supervisor.");
  }

  const today = chileOperationalDate(now);
  const existing = await db.from("operator_shifts").select("id")
    .eq("operator_id", operatorId).eq("parking_id", parking.id).eq("status", "PROGRAMMED").eq("shift_date", today)
    .order("scheduled_start", { ascending: true }).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id;

  const assignment = await ensureOffStreetAssignment(db, parking, operatorId);
  const created = await db.from("operator_shifts").insert({
    operator_id: operatorId,
    parking_id: parking.id,
    sector_id: assignment.sector_id,
    street_id: assignment.street_id,
    assignment_id: assignment.id,
    shift_date: today,
    scheduled_start: "00:00",
    scheduled_end: "23:59",
    status: "PROGRAMMED",
    device_id: null,
    supervisor_id: null,
    notes: ON_DEMAND_SHIFT_NOTE,
  }).select("id").single();
  if (created.error) throw created.error;
  return created.data.id;
}
