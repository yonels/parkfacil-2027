import test from "node:test";
import assert from "node:assert/strict";
import { pickContractedSpacesRow, sanitizeContractedSpacesInput, validateContractedSpacesInput } from "./contractedSpacesInput.mjs";

test("las plazas del contrato mandan sobre las manuales, aunque estas sean más recientes", () => {
  const manual = { contract_id: null, contracted_spaces: 10, updated_at: "2026-11-02" };
  const contract = { contract_id: "c-1", contracted_spaces: 20, updated_at: "2026-11-01" };
  assert.equal(pickContractedSpacesRow([manual, contract]), contract);
});

test("sin contrato se usan las plazas manuales, y sin filas no hay dato", () => {
  const manual = { contract_id: null, contracted_spaces: 10 };
  assert.equal(pickContractedSpacesRow([manual]), manual);
  assert.equal(pickContractedSpacesRow([]), null);
});

test("acepta una cantidad entera positiva", () => {
  const input = sanitizeContractedSpacesInput({ contractedSpaces: "120" });
  assert.equal(input.contractedSpaces, 120);
  assert.deepEqual(validateContractedSpacesInput(input), {});
});

test("trunca decimales sin redondear al alza", () => {
  assert.equal(sanitizeContractedSpacesInput({ contractedSpaces: "120.9" }).contractedSpaces, 120);
});

test("rechaza cero", () => {
  const errors = validateContractedSpacesInput(sanitizeContractedSpacesInput({ contractedSpaces: 0 }));
  assert.ok(errors.contractedSpaces);
});

test("rechaza negativos", () => {
  const errors = validateContractedSpacesInput(sanitizeContractedSpacesInput({ contractedSpaces: -5 }));
  assert.ok(errors.contractedSpaces);
});

test("rechaza valores no numéricos", () => {
  const errors = validateContractedSpacesInput(sanitizeContractedSpacesInput({ contractedSpaces: "no-es-un-numero" }));
  assert.ok(errors.contractedSpaces);
});

test("recorta notas a 500 caracteres", () => {
  const input = sanitizeContractedSpacesInput({ contractedSpaces: 10, notes: "a".repeat(600) });
  assert.equal(input.notes.length, 500);
});
