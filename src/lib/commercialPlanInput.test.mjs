import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { formularioDesdePlan, mapPlan, validarPlanInput } from "./commercialPlanInput.mjs";

const base = { name: "Plan Centro", description: "Plan real", status: "active", type: "per_transaction", currency: "CLP", billingMode: "per_transaction", transactionFee: "35", includedParkings: "1", modules: "POS, Reportes" };

test("valida y arma solo columnas editables (nunca código ni autor)", () => {
  const r = validarPlanInput({ ...base, code: "HACK", created_by: "x" });
  assert.equal(r.ok, true);
  assert.equal(r.row.code, undefined);
  assert.equal(r.row.created_by, undefined);
  assert.equal(r.row.transaction_fee, 35);
  assert.deepEqual(r.row.modules, ["POS", "Reportes"]);
});

test("rechaza datos inválidos", () => {
  assert.equal(validarPlanInput({ ...base, name: " " }).ok, false);
  assert.equal(validarPlanInput({ ...base, status: "borrado" }).ok, false);
  assert.equal(validarPlanInput({ ...base, monthlyFee: -1 }).ok, false);
  assert.equal(validarPlanInput({ ...base, discountPercentage: 101 }).ok, false);
  assert.equal(validarPlanInput(null).ok, false);
});

test("el formulario de edición se precarga con los valores guardados", () => {
  const row = { id: "1", code: "PF-PLAN-001", name: "Plan Centro", description: "Plan real", status: "active", type: "per_transaction", currency: "CLP", billing_mode: "per_transaction", monthly_fee: 0, annual_fee: 0, implementation_fee: 0, transaction_fee: 35, device_fee: 0, parking_fee: 0, support_fee: 0, discount_percentage: 0, minimum_monthly_charge: 0, included_parkings: 1, included_devices: 2, included_users: 3, modules: ["POS"], equipment: [], notes: "Nota", created_at: "2026-10-28T10:00:00Z", updated_at: "2026-10-28T10:00:00.123456+00:00" };
  const plan = mapPlan(row);
  assert.equal(plan.updatedAt, row.updated_at);
  const form = formularioDesdePlan(plan);
  assert.equal(form.name, "Plan Centro");
  assert.equal(form.transactionFee, "35");
  assert.equal(form.includedUsers, "3");
  assert.equal(form.modules, "POS");
  assert.equal(form.notes, "Nota");
  assert.equal(validarPlanInput(form).ok, true);
});

test("PATCH solo Root, con control de versión y sin borrado", async () => {
  const api = await readFile(new URL("../app/api/planes/[id]/route.js", import.meta.url), "utf8");
  assert.match(api, /if \(!actor\.isPlatformAdmin\)/);
  assert.match(api, /\.eq\("updated_at", expected\)/);
  assert.match(api, /status: 409/);
  assert.doesNotMatch(api, /\.delete\(/);
  assert.doesNotMatch(api, /export async function DELETE/);
});

test("el catálogo ya no dice Demostrativo y el detalle muestra acciones solo a Root", async () => {
  const lista = await readFile(new URL("../app/tarifas/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(lista, /Demostrativo/);
  const detalle = await readFile(new URL("../app/tarifas/[id]/page.js", import.meta.url), "utf8");
  assert.match(detalle, /isRoot \? <PlanAcciones/);
});
