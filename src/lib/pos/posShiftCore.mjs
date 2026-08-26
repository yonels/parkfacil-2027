export class PosShiftClosureError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "PosShiftClosureError";
    this.code = code;
    this.status = status;
  }
}

const CASH_METHOD = "CASH";

// Atribución de un pago al turno (regla 3, aprobada): parking_id +
// exit_operator_id + status='PAID' + exit_at entre opened_at y closed_at
// (closed_at ausente = "hasta ahora", para la vista previa de un turno aún
// abierto). Espejo exacto de la agregación SQL de close_pos_shift — se usa
// aquí solo para la vista previa antes de confirmar; el cierre real siempre
// recalcula en el RPC.
export function filterShiftPayments(stays, { operatorId, parkingId, openedAt, closedAt = null } = {}) {
  if (!operatorId || !parkingId || !openedAt) return [];
  const openedAtMs = new Date(openedAt).getTime();
  const closedAtMs = closedAt ? new Date(closedAt).getTime() : Date.now();
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) return [];

  return (Array.isArray(stays) ? stays : []).filter((stay) => {
    if (stay?.status !== "PAID" || !stay?.exit_at) return false;
    if (stay.parking_id !== parkingId) return false;
    if (stay.exit_operator_id !== operatorId) return false;
    const exitAtMs = new Date(stay.exit_at).getTime();
    return Number.isFinite(exitAtMs) && exitAtMs >= openedAtMs && exitAtMs <= closedAtMs;
  });
}

// Totales del turno a partir de los pagos ya atribuidos. cancelledCount/
// cancelledAmount quedan en 0: no existe hoy ningún mecanismo de anulación
// financiera real (reglas 7 y 8) — ver auditoría previa, ningún endpoint
// del sistema anula un pago ya confirmado. debitAmount/creditAmount también
// en 0 por la misma razón que en Pagos del día: el esquema no distingue
// débito de crédito dentro de CARD.
export function summarizeShiftPayments(stays) {
  const list = Array.isArray(stays) ? stays : [];

  let grossAmount = 0;
  let cashAmount = 0;

  for (const stay of list) {
    const amount = Number(stay?.total_amount) || 0;
    grossAmount += amount;
    if (String(stay?.payment_method || "").toUpperCase() === CASH_METHOD) {
      cashAmount += amount;
    }
  }

  const cancelledAmount = 0;
  const netAmount = grossAmount - cancelledAmount;

  return {
    confirmedPaymentsCount: list.length,
    cancelledPaymentsCount: 0,
    cashAmount,
    debitAmount: 0,
    creditAmount: 0,
    grossAmount,
    cancelledAmount,
    netAmount,
  };
}

// Diferencia de caja (regla 7): declarado - sistema. Positivo = sobrante,
// negativo = faltante.
export function calculateCashDifference(declaredCashAmount, systemCashAmount) {
  const declared = Math.round(Number(declaredCashAmount) || 0);
  const system = Math.round(Number(systemCashAmount) || 0);
  return declared - system;
}

// Valida el efectivo declarado y exige observación cuando hay diferencia
// (regla 7: "no permitir confirmar cierre sin observación cuando exista
// diferencia"). Lanza PosShiftClosureError con código/mensaje listos para
// que la API los traduzca a una respuesta HTTP.
export function validateClosureInput({ declaredCashAmount, differenceObservation } = {}, systemCashAmount) {
  const declared = Number(declaredCashAmount);
  if (!Number.isFinite(declared) || declared < 0) {
    throw new PosShiftClosureError("DECLARED_CASH_INVALID", "Ingresa el efectivo declarado como un monto válido.");
  }

  const observation = String(differenceObservation ?? "").trim().slice(0, 1000);
  const difference = calculateCashDifference(declared, systemCashAmount);

  if (difference !== 0 && !observation) {
    throw new PosShiftClosureError("DIFFERENCE_OBSERVATION_REQUIRED", "Debes indicar una observación porque el efectivo declarado no coincide con el del sistema.");
  }

  return { declaredCashAmount: Math.round(declared), differenceObservation: observation, cashDifference: difference };
}

// Proyecta una estadía PAID atribuida al turno al mismo formato que arma
// close_pos_shift en payments_snapshot (jsonb) — usado solo para la vista
// previa antes de confirmar.
export function toPaymentSnapshotRow(stay) {
  return {
    stayId: stay?.id || null,
    plate: stay?.license_plate || "-",
    ticket: stay?.code || "-",
    exitAt: stay?.exit_at || null,
    paymentMethod: stay?.payment_method || "-",
    amount: Number(stay?.total_amount) || 0,
    operatorId: stay?.exit_operator_id || null,
  };
}

// Proyecta una estadía OPEN al mismo formato que pending_vehicles_snapshot.
export function toPendingVehicleRow(stay, now = new Date()) {
  const entryAtMs = new Date(stay?.entry_at).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const elapsedMinutes = Number.isFinite(entryAtMs) && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor((nowMs - entryAtMs) / 60000))
    : null;
  return {
    stayId: stay?.id || null,
    plate: stay?.license_plate || "-",
    ticket: stay?.code || "-",
    entryAt: stay?.entry_at || null,
    elapsedMinutes,
  };
}
