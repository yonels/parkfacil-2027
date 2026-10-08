// Persistencia de salida sin pago y deudas pendientes (SOL-2026-10-08-003).
// Reglas puras en parkingDebtsCore.mjs; guardas definitivas en la base
// (triggers de 20261008100000): este módulo nunca es la única defensa.

import { splitChileTaxFromTotal } from "./dataEntry.mjs";
import { quoteParkingStay } from "./parkingStayQuoteService.js";
import { isMissingTimeBandsSchema } from "./parkingRatesRepository.js";
import { DEBT_STATUSES, buildDebtNotice, mapDebtRow, normalizeDebtPlate } from "./parkingDebtsCore.mjs";

const DEBT_SELECT = "*,parking:parkings(name,code),stay:parking_stays(code,entry_at,exit_at,elapsed_minutes,rate_name,charge_breakdown,unpaid_marked_by_name)";
const PENDING_STAY_FIELDS = "id,code,parking_id,license_plate,entry_at,status,rate_id,rate_name,billing_mode,updated_at,unpaid_shift_id,unpaid_marked_at,unpaid_marked_by,unpaid_marked_by_name,unpaid_notes";

// ---------------------------------------------------------------------------
// Marca "se retiró sin pagar" (D8, D12) y su reversión
// ---------------------------------------------------------------------------

export async function markStayUnpaid(db, { stayId, parkingId, actor, shiftId, notes }) {
  const now = new Date().toISOString();
  const { data, error } = await db.from("parking_stays").update({
    status: "UNPAID_PENDING",
    unpaid_marked_at: now,
    unpaid_marked_by: actor.id,
    unpaid_marked_by_name: actor.name,
    unpaid_shift_id: shiftId,
    unpaid_notes: notes || null,
    updated_at: now,
  }).eq("id", stayId).eq("parking_id", parkingId).eq("status", "OPEN").select(PENDING_STAY_FIELDS).maybeSingle();
  if (error) throw error;
  return data;
}

export async function revertStayUnpaid(db, { stayId, parkingId }) {
  const now = new Date().toISOString();
  const { data, error } = await db.from("parking_stays").update({
    status: "OPEN",
    unpaid_marked_at: null,
    unpaid_marked_by: null,
    unpaid_marked_by_name: null,
    unpaid_shift_id: null,
    unpaid_notes: null,
    updated_at: now,
  }).eq("id", stayId).eq("parking_id", parkingId).eq("status", "UNPAID_PENDING").select("id,code,license_plate,status").maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPendingUnpaidStay(db, { stayId, parkingId }) {
  const { data, error } = await db.from("parking_stays").select(PENDING_STAY_FIELDS)
    .eq("id", stayId).eq("parking_id", parkingId).eq("status", "UNPAID_PENDING").maybeSingle();
  if (error) throw error;
  return data;
}

// Estadías marcadas en un turno aún abierto: el POS las muestra con su monto en
// curso (el contador sigue hasta el cierre del turno, D15).
export async function listPendingUnpaidStaysForShift(db, shiftId, { now = new Date() } = {}) {
  const { data, error } = await db.from("parking_stays").select(PENDING_STAY_FIELDS)
    .eq("unpaid_shift_id", shiftId).eq("status", "UNPAID_PENDING").order("unpaid_marked_at");
  if (error) {
    if (isMissingTimeBandsSchema(error)) return [];
    throw error;
  }
  const rows = [];
  for (const stay of data || []) {
    const quote = await quoteParkingStay(db, stay, { now });
    rows.push({
      stayId: stay.id,
      code: stay.code,
      plate: stay.license_plate,
      entryAt: stay.entry_at,
      markedAt: stay.unpaid_marked_at,
      markedByName: stay.unpaid_marked_by_name,
      notes: stay.unpaid_notes || "",
      amountSoFar: quote.blocked ? null : Number(quote.total || 0),
      blockedReason: quote.blocked ? quote.reason || "UNKNOWN" : null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Cierre de la salida sin pago al cerrar el turno (D15)
// ---------------------------------------------------------------------------

// Calcula el monto hasta la hora de cierre del turno y llama a la función
// atómica finalize_unpaid_stay (estadía UNPAID_EXIT + deuda). Idempotente: si
// ya se cerró no hace nada. Nunca lanza por una estadía individual: devuelve
// las que no se pudieron calcular (p. ej. sin tarifa vigente) para revisión.
export async function finalizeUnpaidStaysForShift(db, shiftId) {
  const result = { finalized: [], requiresReview: [], failed: [] };
  if (!shiftId) return result;
  const { data: closure, error: closureError } = await db.from("shift_closures").select("actual_close_at").eq("shift_id", shiftId).maybeSingle();
  if (closureError) throw closureError;
  if (!closure?.actual_close_at) return result;
  const { data: stays, error } = await db.from("parking_stays").select(PENDING_STAY_FIELDS)
    .eq("unpaid_shift_id", shiftId).eq("status", "UNPAID_PENDING");
  if (error) {
    if (isMissingTimeBandsSchema(error)) return result;
    throw error;
  }
  const closeAtText = closure.actual_close_at;
  const closeAt = new Date(closeAtText);
  for (const stay of stays || []) {
    try {
      const quote = await quoteParkingStay(db, stay, { now: closeAt });
      if (quote.blocked) {
        result.requiresReview.push({ stayId: stay.id, plate: stay.license_plate, reason: quote.reason || "UNKNOWN" });
        continue;
      }
      const total = Math.max(0, Math.floor(Number(quote.subtotal || 0)));
      const { net, tax } = splitChileTaxFromTotal(total);
      const { data: debt, error: rpcError } = await db.rpc("finalize_unpaid_stay", {
        p_stay_id: stay.id,
        p_exit_at: closeAtText,
        p_elapsed_minutes: Number(quote.elapsedMinutes || 0),
        p_rate_id: quote.rate?.id || null,
        p_rate_name: quote.rate?.name || null,
        p_billing_mode: quote.rate?.billingMode || null,
        p_subtotal: total,
        p_net: net,
        p_tax: tax,
        p_total: total,
        p_breakdown: quote.breakdown || null,
      });
      if (rpcError) throw rpcError;
      result.finalized.push(Array.isArray(debt) ? debt[0] : debt);
    } catch (finalizeError) {
      console.error("[unpaid-exit:finalize]", { stayId: stay.id, code: finalizeError?.code, message: finalizeError?.message });
      result.failed.push({ stayId: stay.id, plate: stay.license_plate, code: finalizeError?.code || null });
    }
  }
  return result;
}

// Recuperación: cierra las salidas sin pago cuyo turno ya está cerrado pero que
// quedaron pendientes (p. ej. si el proceso se interrumpió tras el cierre).
export async function finalizeClosedUnpaidStays(db, { parkingIds = null } = {}) {
  let query = db.from("parking_stays").select("unpaid_shift_id").eq("status", "UNPAID_PENDING");
  if (parkingIds) {
    if (!parkingIds.length) return { finalized: [], requiresReview: [], failed: [] };
    query = query.in("parking_id", parkingIds);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingTimeBandsSchema(error)) return { finalized: [], requiresReview: [], failed: [] };
    throw error;
  }
  const shiftIds = [...new Set((data || []).map((row) => row.unpaid_shift_id).filter(Boolean))];
  if (!shiftIds.length) return { finalized: [], requiresReview: [], failed: [] };
  const { data: closures, error: closureError } = await db.from("shift_closures").select("shift_id").in("shift_id", shiftIds);
  if (closureError) throw closureError;
  const merged = { finalized: [], requiresReview: [], failed: [] };
  for (const closure of closures || []) {
    const partial = await finalizeUnpaidStaysForShift(db, closure.shift_id);
    merged.finalized.push(...partial.finalized);
    merged.requiresReview.push(...partial.requiresReview);
    merged.failed.push(...partial.failed);
  }
  return merged;
}

// Nunca hace fallar un cierre de turno ya confirmado: registra el error.
export async function finalizeUnpaidStaysAfterClose(db, shiftId) {
  try {
    return await finalizeUnpaidStaysForShift(db, shiftId);
  } catch (error) {
    console.error("[unpaid-exit:after-close]", { shiftId, code: error?.code, message: error?.message });
    return { finalized: [], requiresReview: [], failed: [{ shiftId, code: error?.code || null }] };
  }
}

// Salidas sin pago de un turno ya cerrado (para el resumen del cierre).
export async function summarizeUnpaidExitsForShift(db, shiftId) {
  const { data, error } = await db.from("parking_stays").select("id,license_plate,total_amount,status")
    .eq("unpaid_shift_id", shiftId).in("status", ["UNPAID_PENDING", "UNPAID_EXIT"]);
  if (error) {
    if (isMissingTimeBandsSchema(error)) return { count: 0, amount: 0, pendingCalculation: 0 };
    throw error;
  }
  const rows = data || [];
  return {
    count: rows.length,
    amount: rows.filter((row) => row.status === "UNPAID_EXIT").reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    pendingCalculation: rows.filter((row) => row.status === "UNPAID_PENDING").length,
  };
}

// ---------------------------------------------------------------------------
// Deudas
// ---------------------------------------------------------------------------

export async function findPendingDebtsForPlate(db, { companyId, plate }) {
  const normalized = normalizeDebtPlate(plate);
  if (!companyId || !normalized) return [];
  const { data, error } = await db.from("parking_debts").select(DEBT_SELECT)
    .eq("company_id", companyId).eq("license_plate", normalized).eq("status", DEBT_STATUSES.PENDING).order("created_at");
  if (error) {
    if (isMissingTimeBandsSchema(error)) return [];
    throw error;
  }
  return (data || []).map(mapDebtRow);
}

export async function buildDebtNoticeForPlate(db, { companyId, plate, parkingIds }) {
  await finalizeClosedUnpaidStays(db, { parkingIds });
  return buildDebtNotice(await findPendingDebtsForPlate(db, { companyId, plate }));
}

// parkingIds: alcance autorizado (estacionamientos visibles para el actor).
export async function listDebts(db, { parkingIds, companyId = null, status = null, plate = null, parkingId = null, from = null, to = null, limit = 500 } = {}) {
  if (!Array.isArray(parkingIds) || !parkingIds.length) return [];
  let query = db.from("parking_debts").select(DEBT_SELECT).in("parking_id", parkingIds).order("created_at", { ascending: false }).limit(limit);
  if (companyId) query = query.eq("company_id", companyId);
  if (status) query = query.eq("status", status);
  if (parkingId) query = query.eq("parking_id", parkingId);
  const normalizedPlate = plate ? normalizeDebtPlate(plate) : null;
  if (plate && normalizedPlate) query = query.eq("license_plate", normalizedPlate);
  else if (plate) query = query.ilike("license_plate", `%${String(plate).toUpperCase().replace(/[^A-Z0-9-]/g, "")}%`);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  const { data, error } = await query;
  if (error) {
    if (isMissingTimeBandsSchema(error)) return [];
    throw error;
  }
  return (data || []).map(mapDebtRow);
}

// Salidas sin pago que no pudieron calcularse al cierre (sin tarifa vigente o
// tarifa en revisión): se muestran para que el administrador las revise.
export async function listUnpaidStaysRequiringReview(db, { parkingIds = null } = {}) {
  let query = db.from("parking_stays").select("id,code,parking_id,license_plate,entry_at,unpaid_marked_at,unpaid_marked_by_name,unpaid_shift_id,parking:parkings(name)")
    .eq("status", "UNPAID_PENDING").order("unpaid_marked_at", { ascending: false });
  if (parkingIds) {
    if (!parkingIds.length) return [];
    query = query.in("parking_id", parkingIds);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingTimeBandsSchema(error)) return [];
    throw error;
  }
  const shiftIds = [...new Set((data || []).map((row) => row.unpaid_shift_id).filter(Boolean))];
  if (!shiftIds.length) return [];
  const { data: closures, error: closureError } = await db.from("shift_closures").select("shift_id").in("shift_id", shiftIds);
  if (closureError) throw closureError;
  const closed = new Set((closures || []).map((row) => row.shift_id));
  return (data || []).filter((row) => closed.has(row.unpaid_shift_id)).map((row) => ({
    stayId: row.id, code: row.code, plate: row.license_plate, parkingName: row.parking?.name || null,
    entryAt: row.entry_at, markedAt: row.unpaid_marked_at, markedByName: row.unpaid_marked_by_name,
  }));
}

export async function getDebt(db, debtId) {
  const { data, error } = await db.from("parking_debts").select(DEBT_SELECT).eq("id", debtId).maybeSingle();
  if (error) throw error;
  return mapDebtRow(data);
}

export async function payDebt(db, { debtId, method, reference, actor, channel }) {
  const now = new Date().toISOString();
  const { data, error } = await db.from("parking_debts").update({
    status: DEBT_STATUSES.PAID, paid_at: now, paid_by: actor.id, paid_by_name: actor.name,
    paid_method: method, paid_reference: reference, paid_channel: channel, updated_at: now,
  }).eq("id", debtId).eq("status", DEBT_STATUSES.PENDING).select(DEBT_SELECT).maybeSingle();
  if (error) throw error;
  return mapDebtRow(data);
}

export async function waiveDebt(db, { debtId, reason, actor, channel }) {
  const now = new Date().toISOString();
  const { data, error } = await db.from("parking_debts").update({
    status: DEBT_STATUSES.WAIVED, waived_at: now, waived_by: actor.id, waived_by_name: actor.name,
    waived_reason: reason, waived_channel: channel, updated_at: now,
  }).eq("id", debtId).eq("status", DEBT_STATUSES.PENDING).select(DEBT_SELECT).maybeSingle();
  if (error) throw error;
  return mapDebtRow(data);
}
