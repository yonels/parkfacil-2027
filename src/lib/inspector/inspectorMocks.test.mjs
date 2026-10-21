import assert from "node:assert/strict";
import test from "node:test";
import { INSPECTOR_PLATE_STATUS, normalizeInspectorPlate } from "./inspectorMocks.mjs";

test("normaliza la patente igual que el resto del sistema: mayúsculas, sin espacios ni caracteres inválidos", () => {
  assert.equal(normalizeInspectorPlate("abc123"), "ABC123");
  assert.equal(normalizeInspectorPlate("  ab c-12/3  "), "ABC123");
  assert.equal(normalizeInspectorPlate(""), "");
});

// Etapa 2, §6: ejemplos exactos del enunciado -- cxpy 33 / CXPY-33 / cxpy33
// deben normalizar todos al mismo valor.
test("distintas variantes de la misma patente normalizan al mismo valor (ejemplo del enunciado)", () => {
  for (const variant of ["cxpy 33", "CXPY-33", "cxpy33"]) {
    assert.equal(normalizeInspectorPlate(variant), "CXPY33", variant);
  }
});

test("los 4 estados aprobados están definidos y son únicos", () => {
  const values = Object.values(INSPECTOR_PLATE_STATUS);
  assert.deepEqual(values.sort(), ["OBSERVADO", "SIN_SESION", "VENCIDO", "VIGENTE"]);
});
