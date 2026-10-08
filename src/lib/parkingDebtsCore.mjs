// Reglas puras de salida sin pago y deudas pendientes (SOL-2026-10-08-003).
// Sin red ni base de datos: las usan las rutas y el POS, y se prueban con node:test.

export const DEBT_STATUSES = Object.freeze({ PENDING: "PENDING", PAID: "PAID", WAIVED: "WAIVED" });
export const DEBT_PAYMENT_METHODS = Object.freeze(["CASH", "CARD", "TRANSFER", "OTHER"]);
export const DEBT_CHANNELS = Object.freeze(["WEB", "POS"]);
export const UNPAID_NOTES_MAX = 300;
export const WAIVE_REASON_MAX = 300;
export const PAID_REFERENCE_MAX = 120;

export const DEBT_STATUS_LABELS = Object.freeze({ PENDING: "Pendiente", PAID: "Pagada", WAIVED: "Condonada" });
export const DEBT_PAYMENT_METHOD_LABELS = Object.freeze({ CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", OTHER: "Otro" });

// Patente normalizada como se guarda en parking_stays ("ABCD-12").
export function normalizeDebtPlate(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function sanitizeUnpaidNotes(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, UNPAID_NOTES_MAX);
}

export class DebtInputError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DebtInputError";
    this.code = code;
  }
}

export function validatePayDebtInput(input = {}) {
  const method = String(input.method || "").toUpperCase();
  if (!DEBT_PAYMENT_METHODS.includes(method)) throw new DebtInputError("Selecciona el medio de pago.", "DEBT_PAYMENT_METHOD_INVALID");
  const reference = String(input.reference || "").trim();
  if (reference.length > PAID_REFERENCE_MAX) throw new DebtInputError("La referencia es demasiado larga.", "DEBT_PAYMENT_REFERENCE_INVALID");
  return { method, reference: reference || null };
}

export function validateWaiveDebtInput(input = {}) {
  const reason = String(input.reason || "").replace(/\s+/g, " ").trim();
  if (!reason) throw new DebtInputError("Indica el motivo de la condonación.", "DEBT_WAIVE_REASON_REQUIRED");
  if (reason.length > WAIVE_REASON_MAX) throw new DebtInputError("El motivo es demasiado largo.", "DEBT_WAIVE_REASON_INVALID");
  return { reason };
}

export function resolveDebtChannel(isTerminalRequest) {
  return isTerminalRequest ? "POS" : "WEB";
}

// Quién puede marcar "se retiró sin pagar" y revertir la marca (D12): el
// operador que la hizo (o un administrador) mientras su turno siga abierto.
export function canRevertUnpaidMark({ stay, actorId, isAdmin }) {
  if (!stay || stay.status !== "UNPAID_PENDING") return false;
  return Boolean(isAdmin) || String(stay.unpaid_marked_by || "") === String(actorId || "");
}

// Solo el administrador (de la empresa o Root) condona o marca pagada (D9).
export function canManageDebts(role) {
  return role === "platform_admin" || role === "company_admin";
}

// Aviso al ingresar una patente: resume las deudas pendientes visibles.
export function buildDebtNotice(debts = []) {
  const pending = debts.filter((debt) => debt.status === DEBT_STATUSES.PENDING);
  if (!pending.length) return null;
  const total = pending.reduce((sum, debt) => sum + Number(debt.amount || 0), 0);
  return {
    plate: pending[0].licensePlate,
    count: pending.length,
    total,
    debts: pending.map((debt) => ({
      id: debt.id,
      amount: Number(debt.amount || 0),
      parkingName: debt.parkingName || null,
      exitAt: debt.exitAt || null,
      createdAt: debt.createdAt,
    })),
  };
}

export function mapDebtRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    parkingId: row.parking_id,
    parkingName: row.parking?.name || row.parking_name || null,
    stayId: row.stay_id,
    stayCode: row.stay?.code || null,
    entryAt: row.stay?.entry_at || null,
    exitAt: row.stay?.exit_at || null,
    elapsedMinutes: row.stay?.elapsed_minutes ?? null,
    rateName: row.stay?.rate_name || null,
    chargeBreakdown: row.stay?.charge_breakdown || null,
    markedByName: row.stay?.unpaid_marked_by_name || null,
    licensePlate: row.license_plate,
    netAmount: Number(row.net_amount || 0),
    taxAmount: Number(row.tax_amount || 0),
    amount: Number(row.amount || 0),
    status: row.status,
    statusLabel: DEBT_STATUS_LABELS[row.status] || row.status,
    notes: row.notes || "",
    createdAt: row.created_at,
    paidAt: row.paid_at,
    paidByName: row.paid_by_name,
    paidMethod: row.paid_method,
    paidMethodLabel: row.paid_method ? DEBT_PAYMENT_METHOD_LABELS[row.paid_method] : null,
    paidReference: row.paid_reference,
    paidChannel: row.paid_channel,
    waivedAt: row.waived_at,
    waivedByName: row.waived_by_name,
    waivedReason: row.waived_reason,
    waivedChannel: row.waived_channel,
  };
}
