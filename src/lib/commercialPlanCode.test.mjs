import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { siguienteCodigoPlan } from "./commercialPlanCode.mjs";

test("primer plan PF-PLAN-001 y correlativo sobre el máximo existente", () => {
  assert.equal(siguienteCodigoPlan([]), "PF-PLAN-001");
  assert.equal(siguienteCodigoPlan(["PF-PLAN-001", "PF-PLAN-007", "pf-plan-003"]), "PF-PLAN-008");
  assert.equal(siguienteCodigoPlan(["OTRO-1", "PF-PLAN-ABC", null]), "PF-PLAN-001");
  assert.equal(siguienteCodigoPlan(["PF-PLAN-999"]), "PF-PLAN-1000");
});

test("ante un choque, el reintento avanza al siguiente número", () => {
  assert.equal(siguienteCodigoPlan(["PF-PLAN-002"], 1), "PF-PLAN-004");
});

test("la API asigna el código y el formulario ya no lo pide", async () => {
  const api = await readFile(new URL("../app/api/planes/route.js", import.meta.url), "utf8");
  assert.doesNotMatch(api, /!text\(input\.code\)/);
  assert.match(api, /code: siguienteCodigoPlan\(codigos, intento\)/);
  const modal = await readFile(new URL("../components/tarifas/PlanCreateModal.js", import.meta.url), "utf8");
  assert.doesNotMatch(modal, /form\.code/);
  assert.match(modal, /Se asigna automáticamente al crear/);
});
