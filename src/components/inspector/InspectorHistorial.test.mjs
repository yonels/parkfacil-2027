import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildInspectorHistory } from "./inspectorHistory.mjs";

test("combina consultas y fiscalizaciones en una sola línea de tiempo, más reciente primero", () => {
  const history = [
    { plate: "ABC123", status: "VIGENTE", at: "2026-08-27T10:00:00Z" },
    { plate: "XYZ789", status: "VENCIDO", at: "2026-08-27T09:00:00Z" },
  ];
  const fiscalizaciones = [{ plate: "XYZ789", motivo: "Exceso de tiempo", at: "2026-08-27T09:05:00Z" }];
  const combined = buildInspectorHistory(history, fiscalizaciones);
  assert.deepEqual(combined.map((e) => e.plate), ["ABC123", "XYZ789", "XYZ789"]);
  assert.deepEqual(combined.map((e) => e.tipo), ["Consulta", "Fiscalización", "Consulta"]);
});

test("una fiscalización nunca lleva un status de consulta inventado", () => {
  const combined = buildInspectorHistory([], [{ plate: "MOR123", motivo: "Otro", at: "2026-08-27T09:00:00Z" }]);
  assert.equal(combined[0].status, null);
});

test("listas vacías no producen entradas", () => {
  assert.deepEqual(buildInspectorHistory([], []), []);
});

test("las pestañas del historial son exactamente Todas/Fiscalizaciones/Consultas", async () => {
  const source = await readFile(new URL("./InspectorHistorial.js", import.meta.url), "utf8");
  assert.match(source, /const TABS = Object\.freeze\(\["Todas", "Fiscalizaciones", "Consultas"\]\)/);
});
