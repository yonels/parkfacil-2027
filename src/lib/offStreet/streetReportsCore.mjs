// Reportes por ubicación en calle (SOL-2026-10-23-001, etapa 4). Lógica pura:
// filas de ocupación por tramo, movimientos con zona/calle/tramo/número y resumen
// agrupado por zona, calle, tramo u operador. Reutiliza toOperationRow (Fase 1)
// para no redefinir qué es un ingreso, una salida o un monto.
import { toOperationRow } from "../offStreetOperationsCore.mjs";

export const STREET_REPORT_VIEWS = Object.freeze(["occupancy", "movements", "summary", "outOfAssignment"]);
export const STREET_SUMMARY_DIMENSIONS = Object.freeze(["zone", "street", "segment", "operator"]);

export function validateStreetReportFilters({ view, groupBy } = {}) {
  if (view && !STREET_REPORT_VIEWS.includes(view)) return { ok: false, message: `view debe ser una de: ${STREET_REPORT_VIEWS.join(", ")}.` };
  if (groupBy && !STREET_SUMMARY_DIMENSIONS.includes(groupBy)) return { ok: false, message: `groupBy debe ser una de: ${STREET_SUMMARY_DIMENSIONS.join(", ")}.` };
  return { ok: true, message: "" };
}

// Índices para nombrar la ubicación de una estadía.
export function buildStreetIndex({ sectors = [], streets = [], segments = [] } = {}) {
  return {
    zone: new Map(sectors.map((item) => [String(item.id), item.name || ""])),
    street: new Map(streets.map((item) => [String(item.id), item.name || ""])),
    segment: new Map(segments.map((item) => [String(item.id), item])),
  };
}

const rangeLabel = (segment) => (segment ? `${segment.from_number}–${segment.to_number}` : "");

// Ocupación actual de un tramo.
export function toSegmentOccupancyRow(segment, { index, occupied = 0, parkingName = "", companyName = "" }) {
  const capacity = Number(segment.capacity || 0);
  const inside = Number(occupied || 0);
  return {
    id: segment.id,
    parkingName,
    companyName,
    zone: index.zone.get(String(segment.area_id)) || "",
    street: index.street.get(String(segment.street_id)) || "",
    segment: segment.name || segment.code || "",
    range: rangeLabel(segment),
    capacity,
    insideCount: inside,
    available: Math.max(capacity - inside, 0),
    occupancyPercentage: capacity > 0 ? Math.round((inside / capacity) * 100) : null,
    status: segment.status,
  };
}

// Movimiento con ubicación: la fila de operación de Fase 1 + zona/calle/tramo/número.
export function toStreetMovementRow(stay, { index, parkingName = "", companyName = "" }) {
  const segment = index.segment.get(String(stay.segment_id));
  return {
    ...toOperationRow(stay, { parkingName, companyName }),
    zone: index.zone.get(String(stay.sector_id)) || "",
    street: index.street.get(String(stay.street_id)) || "",
    segment: segment?.name || segment?.code || "",
    range: rangeLabel(segment),
    streetNumber: stay.street_number ?? null,
    outOfAssignment: stay.out_of_assignment ? "Sí" : "No",
  };
}

const DIMENSION_KEY = { zone: (row) => row.zone, street: (row) => `${row.zone} · ${row.street}`, segment: (row) => `${row.zone} · ${row.street} · ${row.segment}`, operator: (row) => row.entryOperator || "Sin operador" };

// Resumen por zona, calle, tramo u operador (de ingreso).
export function summarizeStreetMovements(rows, groupBy = "segment") {
  const keyOf = DIMENSION_KEY[groupBy] || DIMENSION_KEY.segment;
  const groups = new Map();
  for (const row of rows || []) {
    const key = keyOf(row) || "—";
    const group = groups.get(key) || { id: key, group: key, entries: 0, paidExits: 0, revenueAmount: 0, outOfAssignmentCount: 0, insideCount: 0 };
    group.entries += 1;
    if (row.status === "PAID") { group.paidExits += 1; group.revenueAmount += Number(row.amount || 0); }
    if (row.status === "OPEN" || row.status === "UNPAID_PENDING") group.insideCount += 1;
    if (row.outOfAssignment === "Sí") group.outOfAssignmentCount += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.revenueAmount - a.revenueAmount || b.entries - a.entries || a.group.localeCompare(b.group));
}
