import "server-only";
import { classifyPosShift } from "./posOperatorShiftCore.mjs";

const shiftFields = "id,operator_id,parking_id,assignment_id,sector_id,street_id,shift_date,scheduled_start,scheduled_end,opened_at,closed_at,status,opened_by,closed_by,device_id,notes";

export function chileOperationalDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function mapOperatorShift(row) {
  if (!row) return null;
  return {
    id: row.id,
    operatorId: row.operator_id,
    parkingId: row.parking_id,
    assignmentId: row.assignment_id,
    sectorId: row.sector_id,
    streetId: row.street_id,
    date: row.shift_date,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    status: row.status,
    openedBy: row.opened_by,
    closedBy: row.closed_by,
    deviceId: row.device_id,
    notes: row.notes || "",
  };
}

export function mapOperatorClosure(row) {
  if (!row) return null;
  return {
    id: row.id,
    shiftId: row.shift_id,
    operatorId: row.operator_id,
    parkingId: row.parking_id,
    folio: row.folio,
    shiftOpenedAt: row.actual_start_at,
    shiftClosedAt: row.actual_close_at,
    confirmedPaymentsCount: row.paid_vehicles_count,
    cancelledPaymentsCount: row.cancelled_vehicles_count,
    cashAmount: Number(row.cash_amount || 0),
    debitAmount: 0,
    creditAmount: Number(row.card_amount || 0),
    grossAmount: Number(row.collected_amount || 0),
    cancelledAmount: Number(row.financial_cancellations_total || 0),
    netAmount: Number(row.collected_amount || 0) - Number(row.financial_cancellations_total || 0),
    declaredCashAmount: row.declared_cash_amount == null ? null : Number(row.declared_cash_amount),
    cashDifference: row.cash_difference == null ? null : Number(row.cash_difference),
    differenceObservation: row.difference_observation || "",
    pendingVehiclesCount: row.pending_vehicles_count,
    pendingVehiclesSnapshot: row.pending_vehicles_snapshot || [],
    paymentsSnapshot: row.payments_snapshot || [],
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
  };
}

export async function getPosOperatorShiftState(db, { operatorId, parkingId, now = new Date() }) {
  const open = await db.from("operator_shifts").select(shiftFields)
    .eq("operator_id", operatorId).eq("parking_id", parkingId).in("status", ["OPEN", "CLOSING"])
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (open.error) throw open.error;
  if (open.data) return classifyPosShift(mapOperatorShift(open.data), null);

  const programmed = await db.from("operator_shifts").select(shiftFields)
    .eq("operator_id", operatorId).eq("parking_id", parkingId).eq("status", "PROGRAMMED")
    .eq("shift_date", chileOperationalDate(now)).order("scheduled_start", { ascending: true })
    .limit(1).maybeSingle();
  if (programmed.error) throw programmed.error;
  if (programmed.data) return classifyPosShift(null, mapOperatorShift(programmed.data));
  const closed = await db.from("operator_shifts").select(shiftFields)
    .eq("operator_id", operatorId).eq("parking_id", parkingId).eq("status", "CLOSED")
    .eq("shift_date", chileOperationalDate(now)).order("closed_at", { ascending: false })
    .limit(1).maybeSingle();
  if (closed.error) throw closed.error;
  return classifyPosShift(null, null, mapOperatorShift(closed.data));
}

export async function startPosOperatorShift(db, { shiftId, actor }) {
  const { data, error } = await db.rpc("start_operator_shift", {
    p_shift_id: shiftId,
    p_actor_id: actor.id,
    p_actor_is_admin: Boolean(actor.isAdmin),
  });
  if (error) throw error;
  return mapOperatorShift(Array.isArray(data) ? data[0] : data);
}

export async function loadOperatorShiftPreview(db, shift) {
  const [payments, pending] = await Promise.all([
    db.from("parking_stays").select("id,code,license_plate,exit_at,payment_method,total_amount,exit_operator_id,parking_id,status,payment_shift_id")
      .eq("payment_shift_id", shift.id).eq("parking_id", shift.parkingId).eq("status", "PAID").order("exit_at"),
    db.from("parking_stays").select("id,code,license_plate,entry_at,parking_id,status")
      .eq("parking_id", shift.parkingId).eq("status", "OPEN").order("entry_at"),
  ]);
  if (payments.error) throw payments.error;
  if (pending.error) throw pending.error;
  const rows = payments.data || [];
  const cashAmount = rows.filter((row) => row.payment_method === "CASH").reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const cardAmount = rows.filter((row) => row.payment_method === "CARD").reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  return {
    confirmedPaymentsCount: rows.length,
    cancelledPaymentsCount: 0,
    cashAmount,
    debitAmount: 0,
    creditAmount: cardAmount,
    grossAmount: cashAmount + cardAmount,
    cancelledAmount: 0,
    netAmount: cashAmount + cardAmount,
    paymentsSnapshot: rows.map((row) => ({ stayId: row.id, plate: row.license_plate, ticket: row.code, exitAt: row.exit_at, paymentMethod: row.payment_method, amount: Number(row.total_amount || 0), operatorId: row.exit_operator_id })),
    pendingVehiclesCount: (pending.data || []).length,
    pendingVehicles: (pending.data || []).map((row) => ({ stayId: row.id, plate: row.license_plate, ticket: row.code, entryAt: row.entry_at })),
  };
}

export async function closePosOperatorShift(db, { shiftId, actor, notes, declaredCashAmount, differenceObservation }) {
  const { data, error } = await db.rpc("close_operator_shift", {
    p_shift_id: shiftId,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
    p_actor_is_admin: Boolean(actor.isAdmin),
    p_notes: notes || "",
    p_declared_cash: declaredCashAmount,
    p_difference_observation: differenceObservation || "",
  });
  if (error) throw error;
  return mapOperatorClosure(Array.isArray(data) ? data[0] : data);
}

export async function getOperatorClosureByShift(db, shiftId) {
  const { data, error } = await db.from("shift_closures").select("*").eq("shift_id", shiftId).maybeSingle();
  if (error) throw error;
  return mapOperatorClosure(data);
}
