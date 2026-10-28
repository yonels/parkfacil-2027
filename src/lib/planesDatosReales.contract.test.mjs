// Planes (SOL-2026-10-20-001, 2026-10-28): la vista /tarifas y su detalle muestran
// solo planes reales de commercial_plans; los demostrativos t-001…t-004 de
// src/data/tarifas.mjs ya no se mezclan con ellos.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (ruta) => readFile(new URL(ruta, import.meta.url), "utf8");

test("el listado de Planes no usa los planes demostrativos", async () => {
  const page = await read("../app/tarifas/page.js");
  assert.doesNotMatch(page, /getTarifasDemo|demoTarifas/);
  assert.match(page, /setTarifas\(body\.data\)/);
  assert.match(page, /isRoot \? <PlanCreateModal/);
  assert.match(page, /Aún no hay planes comerciales registrados/);
});

test("el detalle de un plan solo resuelve planes reales", async () => {
  const page = await read("../app/tarifas/[id]/page.js");
  assert.doesNotMatch(page, /getTarifaById/);
  assert.match(page, /const tarifa = await getCommercialPlanPageData\(id\);/);
  assert.doesNotMatch(page, /Descuento demostrativo/);
});
