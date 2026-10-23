import test from "node:test";
import assert from "node:assert/strict";
import {
  activeOperatorAssignments, assignedSegmentIds, assignmentIsActiveAt, operationalClock, parseStreetNumber,
  defaultStreetSegmentId, posStreetSegmentsView, resolveEntryStreetLocation, streetLocationErrorCode,
} from "./streetLocationCore.mjs";

const segment = { id: "seg-1", street_id: "st-1", area_id: "zc", from_number: 100, to_number: 200, capacity: 2, status: "ACTIVE", code: "T1", name: "Agustinas 100-200" };
const segment2 = { id: "seg-2", street_id: "st-1", area_id: "zc", from_number: 201, to_number: 300, capacity: 5, status: "ACTIVE", code: "T2", name: "Agustinas 201-300" };
const assignment = { operator_id: "op-1", street_id: "st-1", number_from: 100, number_to: 200, status: "ACTIVE", valid_from: "2026-10-01", valid_until: null, days_of_week: [1, 2, 3, 4, 5], start_time: "08:00:00", end_time: "20:00:00" };
// Viernes 23-10-2026 12:00 en Chile (UTC-3).
const thursdayNoon = operationalClock(new Date("2026-10-23T15:00:00Z"));

test("reloj operacional en Chile con día ISO", () => {
  assert.deepEqual(thursdayNoon, { date: "2026-10-23", time: "12:00", isoDay: 5 });
  assert.equal(operationalClock(new Date("2026-10-25T15:00:00Z")).isoDay, 7);
});

test("asignación vigente según estado, vigencia, día y horario", () => {
  assert.equal(assignmentIsActiveAt(assignment, thursdayNoon), true);
  assert.equal(assignmentIsActiveAt({ ...assignment, status: "INACTIVE" }, thursdayNoon), false);
  assert.equal(assignmentIsActiveAt({ ...assignment, valid_from: "2026-10-24" }, thursdayNoon), false);
  assert.equal(assignmentIsActiveAt({ ...assignment, valid_until: "2026-10-22" }, thursdayNoon), false);
  assert.equal(assignmentIsActiveAt({ ...assignment, days_of_week: [6, 7] }, thursdayNoon), false);
  assert.equal(assignmentIsActiveAt({ ...assignment, start_time: "13:00" }, thursdayNoon), false);
  assert.equal(assignmentIsActiveAt(assignment, { ...thursdayNoon, time: "20:01" }), false);
});

test("varios tramos por operador y tramo sugerido", () => {
  const active = activeOperatorAssignments([assignment, { ...assignment, operator_id: "op-2" }, { ...assignment, number_from: 201, number_to: 300 }], "op-1", thursdayNoon);
  assert.equal(active.length, 2);
  assert.deepEqual(assignedSegmentIds([segment, segment2], active), ["seg-1", "seg-2"]);
});

test("ingreso en tramo asignado: no queda fuera de asignación; completa calle y zona", () => {
  const result = resolveEntryStreetLocation({ segments: [segment], activeAssignments: [assignment], segmentId: "seg-1", streetNumber: "150" });
  assert.deepEqual(result.location, { segment_id: "seg-1", street_id: "st-1", sector_id: "zc", street_number: 150, out_of_assignment: false });
});

test("ingreso fuera del rango asignado: se permite y se marca", () => {
  const otherNumber = resolveEntryStreetLocation({ segments: [segment2], activeAssignments: [assignment], segmentId: "seg-2", streetNumber: 250 });
  assert.equal(otherNumber.location.out_of_assignment, true);
  const noAssignment = resolveEntryStreetLocation({ segments: [segment], activeAssignments: [], segmentId: "seg-1", streetNumber: "" });
  assert.equal(noAssignment.location.out_of_assignment, true);
  assert.equal(noAssignment.location.street_number, null);
});

test("errores de ubicación", () => {
  assert.equal(resolveEntryStreetLocation({ segments: [segment], segmentId: "x" }).error, "STREET_SEGMENT_NOT_FOUND");
  assert.equal(resolveEntryStreetLocation({ segments: [{ ...segment, status: "INACTIVE" }], segmentId: "seg-1" }).error, "STREET_SEGMENT_NOT_ACTIVE");
  assert.equal(resolveEntryStreetLocation({ segments: [segment], segmentId: "seg-1", streetNumber: 99 }).error, "STAY_STREET_NUMBER_OUT_OF_SEGMENT");
  assert.equal(resolveEntryStreetLocation({ segments: [segment], segmentId: "seg-1", streetNumber: "1a" }).error, "STREET_NUMBER_INVALID");
  assert.equal(resolveEntryStreetLocation({ segments: [segment], segmentId: "", streetNumber: 150 }).error, "STAY_STREET_SEGMENT_REQUIRED");
  assert.equal(resolveEntryStreetLocation({ segments: [segment], segmentId: "" }).location, null);
  assert.equal(parseStreetNumber(" ").value, null);
  assert.equal(streetLocationErrorCode({ message: "STREET_SEGMENT_FULL" }), "STREET_SEGMENT_FULL");
  assert.equal(streetLocationErrorCode({ message: "otro" }), null);
});

test("vista POS: cupo disponible y asignados primero", () => {
  const view = posStreetSegmentsView({ sectors: [{ id: "zc", name: "Zona Centro" }], streets: [{ id: "st-1", name: "Agustinas" }], segments: [segment2, segment, { ...segment, id: "seg-off", status: "INACTIVE" }], occupancy: { "seg-1": 2, "seg-2": 1 }, assignedIds: ["seg-1"] });
  assert.deepEqual(view.map((item) => [item.id, item.available, item.assigned]), [["seg-1", 0, true], ["seg-2", 4, false]]);
  assert.equal(view[0].zoneName, "Zona Centro");
});

test("POS: el tramo propuesto es el asignado con cupo; nunca uno lleno", () => {
  const loc = (segments, defaultSegmentId) => ({ enabled: true, segments, defaultSegmentId });
  assert.equal(defaultStreetSegmentId(loc([{ id: "a", assigned: true, available: 1 }], "a")), "a");
  assert.equal(defaultStreetSegmentId(loc([{ id: "a", assigned: true, available: 0 }, { id: "b", assigned: true, available: 2 }], "a")), "b");
  assert.equal(defaultStreetSegmentId(loc([{ id: "a", assigned: true, available: 0 }, { id: "c", assigned: false, available: 5 }], "a")), "");
  assert.equal(defaultStreetSegmentId({ enabled: false }), "");
});
