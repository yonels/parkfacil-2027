import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeStreetSegment, segmentRangesOverlap, validateStreetSegment } from "./parkingSegments.mjs";

const base = { code: "TR-001", name: "Primer tramo", fromNumber: 101, toNumber: 150, streetSide: "BOTH", capacity: 18, occupiedSpaces: 0, status: "ACTIVE", sortOrder: 1 };

test("normaliza un tramo configurable", () => {
  assert.deepEqual(sanitizeStreetSegment({ ...base, code: " tr-001 " }), { ...base, notes: "" });
});

test("detecta rangos superpuestos del mismo lado", () => {
  assert.equal(segmentRangesOverlap(base, { ...base, code: "TR-002", fromNumber: 140, toNumber: 200 }), true);
});

test("permite rangos coincidentes en lados par e impar", () => {
  assert.equal(segmentRangesOverlap({ ...base, streetSide: "EVEN" }, { ...base, streetSide: "ODD" }), false);
});

test("capacidad es independiente del tamaño del rango", () => {
  assert.deepEqual(validateStreetSegment({ ...base, capacity: 3 }), {});
});

test("ocupación no puede superar capacidad", () => {
  assert.ok(validateStreetSegment({ ...base, occupiedSpaces: 20 }).occupiedSpaces);
});
