import {
  filterShiftPayments,
  summarizeShiftPayments,
  toPaymentSnapshotRow,
  toPendingVehicleRow,
} from "./pos/posShiftCore.mjs";

const parkingFields = "id,code,name,company_name,address,city,status,company:companies(business_name,address,district,city,rut_number,rut_dv,phone)";
const paymentStayFields = "id,code,license_plate,exit_at,payment_method,total_amount,exit_operator_id,parking_id,status";
const openStayFields = "id,code,license_plate,entry_at,parking_id,status";

function toIsoTimestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value || Date.now()).toISOString();
}

function mapShift(row) {
  if (!row) return null;
  return {
    id: row.id,
    operatorId: row.operator_id,
    parkingId: row.parking_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    status: row.status,
  };
}

function mapClosure(row) {
  if (!row) return null;
  return {
    id: row.id,
    shiftId: row.shift_id,
    operatorId: row.operator_id,
    parkingId: row.parking_id,
    confirmedPaymentsCount: row.confirmed_payments_count,
    cancelledPaymentsCount: row.cancelled_payments_count,
    cashAmount: Number(row.cash_amount),
    debitAmount: Number(row.debit_amount),
    creditAmount: Number(row.credit_amount),
    grossAmount: Number(row.gross_amount),
    cancelledAmount: Number(row.cancelled_amount),
    netAmount: Number(row.net_amount),
    declaredCashAmount: Number(row.declared_cash_amount),
    cashDifference: Number(row.cash_difference),
    differenceObservation: row.difference_observation,
    pendingVehiclesCount: row.pending_vehicles_count,
    pendingVehiclesSnapshot: row.pending_vehicles_snapshot || [],
    paymentsSnapshot: row.payments_snapshot || [],
    shiftOpenedAt: row.shift_opened_at,
    shiftClosedAt: row.shift_closed_at,
    folio: row.folio,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
  };
}

async function loadParking(db, parkingId) {
  const { data, error } = await db.from("parkings").select(parkingFields).eq("id", parkingId).eq("status", "ACTIVE").maybeSingle();
  if (error) throw error;
  return data || null;
}

// Un solo turno OPEN por operador (regla 1), garantizado a nivel de índice
// único parcial (pos_shift_one_open_per_operator_idx). Si ya existe uno, se
// reutiliza; si no, se abre uno nuevo con opened_at=ahora. El turno se abre
// de forma perezosa la primera vez que el operador toca cualquier endpoint
// POS del día — no requiere un paso explícito de "iniciar turno" en la UI.
export async function ensureOpenPosShift(db, { operatorId, parkingId, now = new Date() }) {
  const existing = await db.from("pos_shifts").select("*").eq("operator_id", operatorId).eq("status", "OPEN").maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return mapShift(existing.data);

  const insert = await db
    .from("pos_shifts")
    .insert({ operator_id: operatorId, parking_id: parkingId, opened_at: toIsoTimestamp(now), status: "OPEN" })
    .select("*")
    .single();

  if (insert.error) {
    // Carrera con otra pestaña/pestañeo del mismo operador: el índice único
    // parcial rechaza el segundo insert; se recupera el turno ya abierto.
    if (insert.error.code === "23505") {
      const retry = await db.from("pos_shifts").select("*").eq("operator_id", operatorId).eq("status", "OPEN").maybeSingle();
      if (retry.error) throw retry.error;
      if (retry.data) return mapShift(retry.data);
    }
    throw insert.error;
  }

  return mapShift(insert.data);
}

export async function getPosShiftById(db, shiftId) {
  const { data, error } = await db.from("pos_shifts").select("*").eq("id", shiftId).maybeSingle();
  if (error) throw error;
  return mapShift(data);
}

export async function getPosShiftClosureByShiftId(db, shiftId) {
  const { data, error } = await db.from("pos_shift_closures").select("*").eq("shift_id", shiftId).maybeSingle();
  if (error) throw error;
  return mapClosure(data);
}

async function loadAttributedPayments(db, { parkingId, operatorId, openedAt, closedAt }) {
  let query = db
    .from("parking_stays")
    .select(paymentStayFields)
    .eq("parking_id", parkingId)
    .eq("exit_operator_id", operatorId)
    .eq("status", "PAID")
    .gte("exit_at", openedAt);
  if (closedAt) query = query.lte("exit_at", closedAt);
  const { data, error } = await query.order("exit_at", { ascending: true });
  if (error) throw error;
  // filterShiftPayments vuelve a aplicar la regla de atribución completa
  // (incluye el límite superior cuando el turno sigue abierto) por si la
  // query SQL alguna vez se relaja; no cambia el resultado cuando la query
  // ya filtró correctamente.
  return filterShiftPayments(data || [], { operatorId, parkingId, openedAt, closedAt });
}

async function loadOpenStays(db, parkingId) {
  const { data, error } = await db.from("parking_stays").select(openStayFields).eq("parking_id", parkingId).eq("status", "OPEN").order("entry_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Vista previa (solo lectura) del cierre para un turno todavía OPEN — nunca
// se persiste desde aquí. El cierre real siempre recalcula en el RPC
// close_pos_shift server-side (regla 2), esto es solo lo que ve el
// operador en pantalla antes de confirmar.
export async function buildPosShiftPreview(db, shift, { now = new Date() } = {}) {
  const [payments, openStays] = await Promise.all([
    loadAttributedPayments(db, { parkingId: shift.parkingId, operatorId: shift.operatorId, openedAt: shift.openedAt, closedAt: null }),
    loadOpenStays(db, shift.parkingId),
  ]);

  const totals = summarizeShiftPayments(payments);

  return {
    ...totals,
    paymentsSnapshot: payments.map(toPaymentSnapshotRow),
    pendingVehiclesCount: openStays.length,
    pendingVehicles: openStays.map((stay) => toPendingVehicleRow(stay, now)),
    computedAt: toIsoTimestamp(now),
  };
}

// Ejecuta el cierre transaccional (RPC close_pos_shift): recalcula todo
// server-side, congela los snapshots y cierra el turno en un solo
// movimiento. El frontend nunca es la fuente de verdad de estos montos.
export async function closePosShift(db, { shiftId, actor, declaredCashAmount, differenceObservation }) {
  const { data, error } = await db.rpc("close_pos_shift", {
    p_shift_id: shiftId,
    p_actor_id: actor.id,
    p_actor_name: actor.name,
    p_actor_is_admin: Boolean(actor.isAdmin),
    p_declared_cash: declaredCashAmount,
    p_observation: differenceObservation,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapClosure(row);
}

export { loadParking as loadPosShiftParking, mapClosure as mapPosShiftClosure, mapShift as mapPosShift };
