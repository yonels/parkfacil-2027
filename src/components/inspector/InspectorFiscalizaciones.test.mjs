import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// 2026-09-03, "abrir detalle desde la lista de Fiscalizaciones": bug real
// reportado en Production ("toco QA9001 y no abre el detalle") -- causa
// exacta: cada <li> no tenía NINGÚN onClick/Link, era puramente estático.
const source = await readFile(new URL("./InspectorFiscalizaciones.js", import.meta.url), "utf8");

test("TAREA 5.A: cada tarjeta de la lista es tocable -- llama a onOpen(f) con la fila completa", () => {
  assert.match(source, /export default function InspectorFiscalizaciones\(\{ fiscalizaciones, onNueva, onOpen \}\)/);
  assert.match(source, /<button[\s\S]{0,40}type="button"[\s\S]{0,40}onClick=\{\(\) => onOpen\?\.\(f\)\}/);
});

test("la tarjeta ya NO es un <li> sin ningún manejador -- debe envolver un <button> real (accesible, focuseable), no un onClick suelto en el <li>", () => {
  assert.doesNotMatch(source, /<li key=\{i\} className="rounded-2xl bg-white p-4 shadow-sm">/, "esa era la versión estática original del bug -- no debe reaparecer");
  assert.match(source, /<li key=\{i\}>\s*<button/);
});

test("abrir el detalle es responsabilidad de InspectorApp.js (vía onOpen) -- esta lista nunca hace fetch ni navega por su cuenta", () => {
  assert.doesNotMatch(source, /fetch\(|window\.location/);
});
