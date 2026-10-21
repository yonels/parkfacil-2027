import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeStreetSegment, segmentRangesOverlap, validateStreetSegment, sortOrderToLetter, letterToSortOrder, segmentCodeForLetter, nextAvailableSortOrder } from "./parkingSegments.mjs";

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

// --- Tramo A/B/C (corrección UX "Proyectos On Street" 2026-08-29) ---

test("sortOrderToLetter: 1=A, 2=B... 26=Z, 27=AA, 28=AB (numeración de columnas de hoja de cálculo)", () => {
  assert.equal(sortOrderToLetter(1), "A");
  assert.equal(sortOrderToLetter(2), "B");
  assert.equal(sortOrderToLetter(26), "Z");
  assert.equal(sortOrderToLetter(27), "AA");
  assert.equal(sortOrderToLetter(28), "AB");
  assert.equal(sortOrderToLetter(52), "AZ");
  assert.equal(sortOrderToLetter(53), "BA");
});

test("letterToSortOrder es la inversa exacta de sortOrderToLetter", () => {
  for (const n of [1, 2, 25, 26, 27, 28, 52, 53, 100, 703]) {
    assert.equal(letterToSortOrder(sortOrderToLetter(n)), n);
  }
  assert.equal(letterToSortOrder("a"), letterToSortOrder("A"), "insensible a mayúsculas");
});

test("segmentCodeForLetter deriva el código automático de la letra -- el usuario nunca lo escribe", () => {
  assert.equal(segmentCodeForLetter("A"), "TR-A");
  assert.equal(segmentCodeForLetter("aa"), "TR-AA");
});

test("nextAvailableSortOrder: primera letra libre, excluyendo huecos ya usados por OTROS tramos de la misma calle", () => {
  assert.equal(nextAvailableSortOrder([]), 1, "calle vacía -> A");
  assert.equal(nextAvailableSortOrder([1, 2, 3]), 4, "sin huecos -> siguiente letra");
  assert.equal(nextAvailableSortOrder([1, 3]), 2, "hueco en 2 (Tramo B libre) -> lo reutiliza en vez de saltar a D");
  assert.equal(nextAvailableSortOrder([1, 2], 1), 1, "al editar el propio tramo (excludeSortOrder), su letra actual no cuenta como ocupada por otro");
});
