import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeContractedSpacesInput, validateContractedSpacesInput } from "./contractedSpacesInput.mjs";

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
