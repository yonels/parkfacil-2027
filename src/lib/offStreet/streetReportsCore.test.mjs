import test from "node:test";
import assert from "node:assert/strict";
import { buildStreetIndex, summarizeStreetMovements, toSegmentOccupancyRow, toStreetMovementRow, validateStreetReportFilters } from "./streetReportsCore.mjs";

const index = buildStreetIndex({
  sectors: [{ id: "zc", name: "Zona Centro" }],
  streets: [{ id: "ag", name: "Agustinas" }],
  segments: [{ id: "t1", area_id: "zc", street_id: "ag", name: "Agustinas 100-200", code: "T1", from_number: 100, to_number: 200, capacity: 4, status: "ACTIVE" }],
});
const stay = (over) => ({ id: "s", code: "ING-1", license_plate: "KLMN-11", parking_id: "p", status: "PAID", entry_at: "2026-10-23T15:00:00Z", exit_at: "2026-10-23T16:00:00Z", entry_operator_name: "Operador A", total_amount: 1000, segment_id: "t1", sector_id: "zc", street_id: "ag", street_number: 150, out_of_assignment: false, ...over });

test("filtros de vista y agrupación", () => {
  assert.equal(validateStreetReportFilters({ view: "summary", groupBy: "operator" }).ok, true);
  assert.equal(validateStreetReportFilters({ view: "x" }).ok, false);
  assert.equal(validateStreetReportFilters({ groupBy: "x" }).ok, false);
});

test("ocupación por tramo", () => {
  const row = toSegmentOccupancyRow(index.segment.get("t1"), { index, occupied: 3, parkingName: "QA" });
  assert.deepEqual([row.zone, row.street, row.segment, row.range, row.capacity, row.insideCount, row.available, row.occupancyPercentage], ["Zona Centro", "Agustinas", "Agustinas 100-200", "100–200", 4, 3, 1, 75]);
  assert.equal(toSegmentOccupancyRow({ ...index.segment.get("t1"), capacity: 0 }, { index }).occupancyPercentage, null);
});

test("movimiento con ubicación y marca fuera de asignación", () => {
  const row = toStreetMovementRow(stay({ out_of_assignment: true }), { index, parkingName: "QA" });
  assert.equal(row.plate, "KLMN-11");
  assert.equal(row.zone, "Zona Centro");
  assert.equal(row.street, "Agustinas");
  assert.equal(row.range, "100–200");
  assert.equal(row.streetNumber, 150);
  assert.equal(row.outOfAssignment, "Sí");
  assert.equal(row.amount, 1000);
});

test("resumen por tramo y por operador: ingresos, salidas pagadas, recaudación, dentro y fuera de rango", () => {
  const rows = [
    toStreetMovementRow(stay({}), { index }),
    toStreetMovementRow(stay({ out_of_assignment: true, total_amount: 500 }), { index }),
    toStreetMovementRow(stay({ status: "OPEN", total_amount: null, exit_at: null, entry_operator_name: "Operador B" }), { index }),
  ];
  const [segmentGroup] = summarizeStreetMovements(rows, "segment");
  assert.deepEqual({ ...segmentGroup }, { id: "Zona Centro · Agustinas · Agustinas 100-200", group: "Zona Centro · Agustinas · Agustinas 100-200", entries: 3, paidExits: 2, revenueAmount: 1500, outOfAssignmentCount: 1, insideCount: 1 });
  const byOperator = summarizeStreetMovements(rows, "operator");
  assert.deepEqual(byOperator.map((g) => [g.group, g.entries, g.revenueAmount]), [["Operador A", 2, 1500], ["Operador B", 1, 0]]);
  assert.equal(summarizeStreetMovements(rows, "zone")[0].group, "Zona Centro");
});
