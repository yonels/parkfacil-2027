import test from "node:test";
import assert from "node:assert/strict";
import { validateDirectPassword } from "./userCredentialCore.mjs";

test("acepta una clave directa robusta", () => {
  assert.deepEqual(validateDirectPassword("ClaveSegura!2027"), []);
});

test("rechaza claves débiles indicando sus requisitos", () => {
  const errors = validateDirectPassword("corta");
  assert.equal(errors.length, 4);
  assert.match(errors.join(" "), /12 caracteres/);
  assert.match(errors.join(" "), /mayúscula/);
  assert.match(errors.join(" "), /número/);
  assert.match(errors.join(" "), /símbolo/);
});
