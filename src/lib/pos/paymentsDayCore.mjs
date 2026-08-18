import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "../dataEntry.mjs";

// Métodos de pago que hoy existen en parking_stays.payment_method. No hay
// distinción entre débito y crédito en el esquema actual (solo CASH/CARD),
// así que esos totales se exponen siempre en 0 en vez de inventar un reparto:
// ver summarizeDailyPayments.
const CASH_METHOD = "CASH";

// Filtra estadías PAID cuyo exit_at cae dentro del día operacional
// (America/Santiago) de `now`. Compara el día calendario ya resuelto en la
// zona horaria operacional (misma utilidad que usan los tickets de
// ingreso/salida) en vez de calcular límites UTC exactos a mano, evitando
// errores por cambios de horario de verano.
export function filterPaidStaysForOperationalDay(stays, { now = new Date(), timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  const todayLabel = toOperationalDateTimeParts(now, timeZone)?.entryDate;
  if (!todayLabel) return [];

  return (Array.isArray(stays) ? stays : []).filter((stay) => {
    if (stay?.status !== "PAID" || !stay?.exit_at) return false;
    const parts = toOperationalDateTimeParts(stay.exit_at, timeZone);
    return parts?.entryDate === todayLabel;
  });
}

// Calcula los totales del día a partir de estadías PAID ya filtradas.
// totalDebit/totalCredit quedan siempre en 0: el esquema actual no distingue
// débito de crédito dentro de CARD, y la instrucción explícita es no
// inventar ese reparto — cuando exista esa distinción en el backend, esta
// función es el único lugar a actualizar.
export function summarizeDailyPayments(stays) {
  const list = Array.isArray(stays) ? stays : [];

  let totalAmount = 0;
  let totalCash = 0;

  for (const stay of list) {
    const amount = Number(stay?.total_amount) || 0;
    totalAmount += amount;
    if (String(stay?.payment_method || "").toUpperCase() === CASH_METHOD) {
      totalCash += amount;
    }
  }

  return {
    totalAmount,
    totalCash,
    totalDebit: 0,
    totalCredit: 0,
    count: list.length,
  };
}

// Proyecta una estadía PAID a los campos mínimos requeridos por la pantalla
// PAGOS DEL DÍA (patente, hora, medio de pago, monto).
export function toDailyPaymentRow(stay, { timeZone = OPERATIONAL_TIME_ZONE } = {}) {
  const exitParts = toOperationalDateTimeParts(stay?.exit_at, timeZone);
  return {
    id: stay?.id || null,
    plate: stay?.license_plate || "-",
    time: exitParts?.entryTime || "-",
    paymentMethod: stay?.payment_method || "-",
    amount: Number(stay?.total_amount) || 0,
    ticketNumber: stay?.code || "-",
    paymentCode: stay?.payment_code || "-",
  };
}
