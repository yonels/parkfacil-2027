// Reglas de turnos por estacionamiento Off Street (SOL-2026-10-29-006). Puro,
// sin red: lo usan /api/pos/shift, /api/pos/shift/start, /api/data-entry y la
// configuración del estacionamiento.
//
// 1. Inicio de turno programado: ventana antes de la hora de inicio.
// 2. Turno vencido (pasó su término, que incluye los de días anteriores):
//    ALLOW como hoy · WARN aviso fijo · BLOCK sin ingresos; los cobros de los
//    vehículos que quedan dentro solo si no hay relevo (otro turno del
//    estacionamiento cuyo horario ya empezó).
// 3. Turno a pedido: siempre · solo sin turno programado ese día · nunca.
// Valores iniciales = comportamiento anterior («como hoy»).

import { zonedLocalToUtc } from "../releasedPayment/zonedTime.mjs";

export const SHIFT_RULES_TIME_ZONE = "America/Santiago";
export const SHIFT_START_WINDOWS = ["FREE", "60", "30", "15", "0"];
export const SHIFT_EXPIRED_POLICIES = ["ALLOW", "WARN", "BLOCK"];
export const SHIFT_ON_DEMAND_POLICIES = ["ALWAYS", "NO_PROGRAMMED", "NEVER"];
export const DEFAULT_SHIFT_RULES = Object.freeze({ startWindow: "FREE", expiredPolicy: "ALLOW", onDemandPolicy: "ALWAYS" });

export function normalizeShiftRules(row) {
  const pick = (value, allowed, fallback) => (allowed.includes(String(value)) ? String(value) : fallback);
  return {
    startWindow: pick(row?.shift_start_window ?? row?.startWindow, SHIFT_START_WINDOWS, DEFAULT_SHIFT_RULES.startWindow),
    expiredPolicy: pick(row?.shift_expired_policy ?? row?.expiredPolicy, SHIFT_EXPIRED_POLICIES, DEFAULT_SHIFT_RULES.expiredPolicy),
    onDemandPolicy: pick(row?.shift_on_demand_policy ?? row?.onDemandPolicy, SHIFT_ON_DEMAND_POLICIES, DEFAULT_SHIFT_RULES.onDemandPolicy),
  };
}

export function validateShiftRulesInput(input) {
  const errors = {};
  if (!SHIFT_START_WINDOWS.includes(String(input?.startWindow))) errors.startWindow = "Elige el margen de inicio.";
  if (!SHIFT_EXPIRED_POLICIES.includes(String(input?.expiredPolicy))) errors.expiredPolicy = "Elige qué hacer con un turno vencido.";
  if (!SHIFT_ON_DEMAND_POLICIES.includes(String(input?.onDemandPolicy))) errors.onDemandPolicy = "Elige la regla del turno a pedido.";
  return errors;
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

// Instantes de inicio y término del horario programado (hora de Chile). Si el
// término es anterior al inicio, el turno cruza la medianoche.
export function shiftWindow(shift, timeZone = SHIFT_RULES_TIME_ZONE) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(shift?.shift_date ?? shift?.date ?? ""));
  const start = parseTime(shift?.scheduled_start ?? shift?.scheduledStart);
  const end = parseTime(shift?.scheduled_end ?? shift?.scheduledEnd);
  if (!date || !start || !end) return null;
  const day = { year: Number(date[1]), month: Number(date[2]), day: Number(date[3]) };
  const startMs = zonedLocalToUtc({ ...day, ...start }, timeZone);
  let endMs = zonedLocalToUtc({ ...day, ...end }, timeZone);
  if (endMs <= startMs) endMs += 24 * 3_600_000;
  return { startMs, endMs };
}

const clock = (ms) => new Intl.DateTimeFormat("es-CL", { timeZone: SHIFT_RULES_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
const dayMonth = (ms) => new Intl.DateTimeFormat("es-CL", { timeZone: SHIFT_RULES_TIME_ZONE, day: "2-digit", month: "2-digit" }).format(new Date(ms)).replace("/", "-");

// Regla 1: ¿se puede iniciar ahora el turno programado?
export function programmedStartCheck(rules, shift, now = new Date()) {
  const { startWindow } = normalizeShiftRules(rules);
  if (startWindow === "FREE") return { ok: true };
  const window = shiftWindow(shift);
  if (!window) return { ok: true };
  const nowMs = now.getTime();
  const fromMs = window.startMs - Number(startWindow) * 60_000;
  if (nowMs < fromMs) {
    return { ok: false, code: "SHIFT_START_TOO_EARLY", availableFrom: new Date(fromMs).toISOString(), message: `Tu turno comienza a las ${clock(window.startMs)}. Podrás iniciarlo desde las ${clock(fromMs)}.` };
  }
  if (nowMs >= window.endMs) {
    return { ok: false, code: "SHIFT_START_TOO_LATE", message: `Tu turno programado terminó a las ${clock(window.endMs)}. Pide al administrador que lo reprograme.` };
  }
  return { ok: true };
}

// Regla 3: ¿se puede abrir un turno a pedido?
export function onDemandStartCheck(rules, { hasProgrammedToday = false } = {}) {
  const { onDemandPolicy } = normalizeShiftRules(rules);
  if (onDemandPolicy === "NEVER") return { ok: false, code: "ON_DEMAND_NOT_ALLOWED", message: "En este estacionamiento solo se trabaja con turnos programados. Pide al administrador que te programe uno." };
  if (onDemandPolicy === "NO_PROGRAMMED" && hasProgrammedToday) return { ok: false, code: "ON_DEMAND_PROGRAMMED_EXISTS", message: "Tienes un turno programado hoy en este estacionamiento: inícialo en su horario." };
  return { ok: true };
}

// ¿Hay relevo? Otro turno del estacionamiento (programado o abierto, de otro
// operador o del mismo) cuyo horario ya empezó y aún no termina.
export function findHandover(shift, otherShifts, now = new Date()) {
  const nowMs = now.getTime();
  const own = shiftWindow(shift);
  return (otherShifts || []).find((other) => {
    if (!other || other.id === shift?.id || !["PROGRAMMED", "OPEN"].includes(other.status)) return false;
    const window = shiftWindow(other);
    return Boolean(window) && window.startMs <= nowMs && nowMs < window.endMs && (!own || window.startMs >= own.endMs - 60_000);
  }) || null;
}

// Regla 2: estado operativo del turno abierto.
//   mode OK · WARN (aviso, todo permitido) · COLLECT_ONLY (sin ingresos, cobra
//   lo que queda) · CLOSE_ONLY (relevo: solo cerrar).
export function openShiftStatus(rules, shift, { now = new Date(), handover = null, handoverOperatorName = "" } = {}) {
  const { expiredPolicy } = normalizeShiftRules(rules);
  const window = shiftWindow(shift);
  if (!window || now.getTime() < window.endMs || expiredPolicy === "ALLOW") return { mode: "OK", expired: Boolean(window) && now.getTime() >= window.endMs };
  const ended = `Tu turno terminó el ${dayMonth(window.endMs)} a las ${clock(window.endMs)}.`;
  if (expiredPolicy === "WARN") {
    return { mode: "WARN", expired: true, endedAt: new Date(window.endMs).toISOString(), message: `${ended} Puedes seguir operando, pero ciérralo cuanto antes para cuadrar la caja.` };
  }
  if (handover) {
    const next = handoverOperatorName ? `${handoverOperatorName} tiene el turno siguiente` : "Hay un turno siguiente";
    return { mode: "CLOSE_ONLY", expired: true, endedAt: new Date(window.endMs).toISOString(), message: `${ended} ${next} (desde las ${clock(shiftWindow(handover).startMs)}): ese turno cobra los vehículos que quedan dentro. Cierra tu turno para cuadrar tu caja.` };
  }
  return { mode: "COLLECT_ONLY", expired: true, endedAt: new Date(window.endMs).toISOString(), message: `${ended} No hay otro turno programado: puedes cobrar la salida de los vehículos que quedan dentro, pero ya no registrar ingresos. Al terminar, cierra tu turno.` };
}

// ¿Puede el turno abierto hacer esta operación del POS?
const ENTRY_ACTIONS = new Set(["ENTRY"]);
const COLLECT_ACTIONS = new Set(["EXIT", "RELEASED_EXIT", "CARD_PAYMENT_RESERVE", "UNPAID_EXIT"]);
export function operationAllowed(status, action) {
  if (!status || status.mode === "OK" || status.mode === "WARN") return { ok: true };
  if (ENTRY_ACTIONS.has(action) || (status.mode === "CLOSE_ONLY" && COLLECT_ACTIONS.has(action))) {
    return { ok: false, code: status.mode === "CLOSE_ONLY" ? "SHIFT_HANDOVER" : "SHIFT_EXPIRED", message: status.message };
  }
  return { ok: true };
}
