// Lógica pura (sin acceso a base de datos) para /reportes-off-street (Fase
// 4). Reutiliza deliberadamente el mapeo de fila real de Fase 1
// (toOperationRow, offStreetOperationsCore.mjs) para los reportes de
// movimientos -- nunca redefine qué es un ingreso/salida/ticket abierto.
// Solo aporta lo que todavía no existe: validación de pestaña/filtros,
// protección CSV, y el mapeo de turnos/ocupación (dominios sin cubrir en
// Fase 1-3).
import { OPERATIONAL_TIME_ZONE, toOperationalDateTimeParts } from "./dataEntry.mjs";
import { computeOccupancy } from "./offStreetDashboardCore.mjs";

export const REPORT_TABS = Object.freeze(["movements", "parked", "shifts", "occupancy"]);
// Mismos estados reales que ya usa /api/estacionamientos/[id]/turnos y el
// Dashboard (Fase 3) para "turno actualmente abierto" -- nunca una
// definición nueva.
export const SHIFT_STATUSES = Object.freeze(["PROGRAMMED", "OPEN", "CLOSING", "CLOSED", "CANCELLED"]);

export function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateReportsFilters({ type, dateFrom, dateTo, status } = {}) {
  if (type && !REPORT_TABS.includes(type)) {
    return { ok: false, message: `type debe ser una de: ${REPORT_TABS.join(", ")}.` };
  }
  if (dateFrom && !isValidIsoDate(dateFrom)) return { ok: false, message: "dateFrom debe tener formato AAAA-MM-DD." };
  if (dateTo && !isValidIsoDate(dateTo)) return { ok: false, message: "dateTo debe tener formato AAAA-MM-DD." };
  if (dateFrom && dateTo && dateFrom > dateTo) return { ok: false, message: "dateFrom no puede ser posterior a dateTo." };
  if (status && !SHIFT_STATUSES.includes(status)) {
    return { ok: false, message: `status debe ser una de: ${SHIFT_STATUSES.join(", ")}.` };
  }
  return { ok: true, message: "" };
}

// --- CSV (§8 del alcance) ---------------------------------------------
// Protección contra CSV injection: una celda que empieza con =,+,-,@ se
// interpreta como fórmula al abrirla en Excel/Sheets -- se antepone una
// comilla simple (mismo mecanismo estándar OWASP) para neutralizarla sin
// alterar el valor visible.
const CSV_FORMULA_PREFIXES = ["=", "+", "-", "@"];

export function sanitizeCsvCell(value) {
  const text = String(value ?? "");
  if (CSV_FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) return `'${text}`;
  return text;
}

export function buildCsvContent(headers, rows) {
  const escape = (value) => `"${sanitizeCsvCell(value).replaceAll('"', '""')}"`;
  const lines = [headers.map(escape).join(";"), ...rows.map((row) => row.map(escape).join(";"))];
  // BOM UTF-8 para que Excel reconozca acentos/ñ sin configuración manual.
  return `﻿${lines.join("\r\n")}`;
}

// --- Vehículos estacionados (§2.3) --------------------------------------
// Reutiliza el mismo mapeo de fila real de Fase 1 (toOperationRow) para
// ticket/patente/empresa/estacionamiento/operador/origen -- solo agrega el
// tiempo transcurrido (dominio nuevo: "ahora - entry_at" en minutos), sin
// inventar ni recalcular una tarifa paralela.
export function elapsedMinutesSince(entryAt, now = new Date()) {
  if (!entryAt) return null;
  const start = new Date(entryAt).getTime();
  const end = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(Math.round((end - start) / 60000), 0);
}

// --- Operadores y turnos (§2.5) -----------------------------------------
export function shiftStatusLabel(status) {
  const labels = { PROGRAMMED: "Programado", OPEN: "Abierto", CLOSING: "En cierre", CLOSED: "Cerrado", CANCELLED: "Anulado" };
  return labels[status] || status || "—";
}

// Fila real de operator_shifts -> forma de UI. `entryCount`/`revenueAmount`
// llegan YA resueltos por el llamador (lote por página vía entry_shift_id/
// payment_shift_id, ver offStreetReportsService.js) -- nunca una heurística
// por fecha+operador, siempre el FK real.
export function toShiftReportRow(shift, { timeZone = OPERATIONAL_TIME_ZONE, parkingName = "", companyName = "", operatorName = "", entryCount = 0, revenueAmount = 0 } = {}) {
  const openedParts = shift?.opened_at ? toOperationalDateTimeParts(shift.opened_at, timeZone) : null;
  const closedParts = shift?.closed_at ? toOperationalDateTimeParts(shift.closed_at, timeZone) : null;
  return {
    id: shift?.id || null,
    operator: operatorName || shift?.operator_id || "—",
    parkingId: shift?.parking_id || null,
    parkingName,
    companyName,
    shiftDate: shift?.shift_date || null,
    openedDate: openedParts?.entryDate || "-",
    openedTime: openedParts?.entryTime || "-",
    closedDate: closedParts?.entryDate || "",
    closedTime: closedParts?.entryTime || "",
    status: shift?.status || null,
    entryCount,
    revenueAmount,
  };
}

// --- Ocupación (§2.6) -----------------------------------------------------
// Reutiliza computeOccupancy (Fase 3, misma fórmula, misma protección de
// división por cero) -- capacity/insideCount llegan ya resueltos por el
// llamador (getDashboardCapacityByParking + conteo agrupado de OPEN, ver
// offStreetReportsService.js).
export function toOccupancyReportRow(parking, { capacity = 0, insideCount = 0 } = {}) {
  const occupancy = computeOccupancy({ capacity, insideCount });
  return {
    parkingId: parking?.id || null,
    parkingName: parking?.name || "",
    companyName: parking?.companyName || "",
    ...occupancy,
  };
}
