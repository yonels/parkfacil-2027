import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { fechaValida, traducirErrorPlan, validarAccionPlan } from "./contractPlanCore.mjs";

const PLAN = "11111111-2222-4333-8444-555555555555";

test("fechas: solo AAAA-MM-DD reales", () => {
  assert.equal(fechaValida("2026-10-28"), true);
  assert.equal(fechaValida("2026-02-30"), false);
  assert.equal(fechaValida("28-10-2026"), false);
  assert.equal(fechaValida(""), false);
});

test("acciones asignar y quitar", () => {
  assert.deepEqual(validarAccionPlan({ accion: "asignar", planId: PLAN, validFrom: "2026-11-01", reason: " Upgrade " }), { ok: true, accion: "asignar", planId: PLAN, fecha: "2026-11-01", motivo: "Upgrade" });
  assert.equal(validarAccionPlan({ accion: "asignar", planId: "x", validFrom: "2026-11-01" }).ok, false);
  assert.equal(validarAccionPlan({ accion: "asignar", planId: PLAN }).ok, false);
  assert.equal(validarAccionPlan({ accion: "quitar", validTo: "2026-11-30" }).ok, true);
  assert.equal(validarAccionPlan({ accion: "borrar" }).ok, false);
  assert.equal(validarAccionPlan(null).ok, false);
});

test("errores SQL a mensajes claros", () => {
  assert.equal(traducirErrorPlan({ message: "MONEDA_DISTINTA" }).status, 400);
  assert.equal(traducirErrorPlan({ message: "MISMO_PLAN" }).status, 409);
  assert.equal(traducirErrorPlan({ message: "CONTRATO_INEXISTENTE" }).status, 404);
  assert.equal(traducirErrorPlan({ code: "23505", message: "dup" }).status, 409);
  assert.equal(traducirErrorPlan({ code: "XX", message: "interno" }).status, 500);
});

test("API y vista solo para Root; Planes enlaza a la vista de la empresa", async () => {
  for (const ruta of ["../app/api/planes/contratos/[contractId]/route.js", "../app/api/planes/empresas/[companyId]/route.js"]) {
    const api = await readFile(new URL(ruta, import.meta.url), "utf8");
    assert.match(api, /if \(!actor\.isPlatformAdmin\)/);
  }
  const lista = await readFile(new URL("../app/tarifas/page.js", import.meta.url), "utf8");
  assert.match(lista, /isRoot\?`\/tarifas\/empresas\/\$\{empresa\.id\}`:`\/empresas\/\$\{empresa\.id\}`/);
  const migracion = await readFile(new URL("../../supabase/migrations/20261028180000_contract_plan_assignments.sql", import.meta.url), "utf8");
  assert.match(migracion, /contract_plan_assignments_vigente/);
  assert.match(migracion, /revoke all on public\.contract_plan_assignments from anon, authenticated/);
});
