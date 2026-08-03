import test from "node:test";
import assert from "node:assert/strict";
import { calculateChileTax, joinChileanPlate, normalizePlate, sanitizeMovementInput, splitChileanPlate, validateMovementInput } from "./dataEntry.mjs";

test("normaliza patentes para captura táctil", () => assert.equal(normalizePlate("ab-cd 12"), "ABCD12"));
test("valida campos operacionales obligatorios", () => {
  const errors = validateMovementInput(sanitizeMovementInput({ movementType: "entry", plate: "ABC", source: "pos" }));
  assert.deepEqual(Object.keys(errors).sort(), ["accessPoint", "parkingId", "plate"]);
});
test("acepta un ingreso completo desde POS", () => {
  const errors = validateMovementInput(sanitizeMovementInput({ movementType: "entry", plate: "AB-CD-12", parkingId: "p1", accessPoint: "Acceso 1", source: "pos" }));
  assert.deepEqual(errors, {});
});
test("compone patente chilena en dos campos", () => {
  assert.equal(joinChileanPlate("cxpy", "93"), "CXPY-93");
  assert.deepEqual(splitChileanPlate("CXPY-93"), { prefix: "CXPY", suffix: "93" });
});
test("calcula neto IVA y total", () => assert.deepEqual(calculateChileTax(1000), { net: 1000, tax: 190, total: 1190, taxRate: 0.19 }));
