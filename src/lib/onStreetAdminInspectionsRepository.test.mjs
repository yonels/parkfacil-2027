import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// onStreetAdminInspectionsRepository.js es "server-only" (no se puede
// importar directo en node --test, igual restricción que el resto del
// módulo On Street admin -- ver onStreetAdminAuthorization.test.mjs para el
// mismo patrón ya establecido). Se prueba por inspección de código fuente
// el contrato exacto de aislamiento (§9 de la auditoría 2026-08-28:
// fiscalizaciones sin parking_id), complementado con la prueba real end-to-
// end en scripts/local-on-street-extension-e2e.mjs y con los tests puros de
// computeInspectionKpis ya existentes (onStreetInspectionsAdminCore.test.mjs).

const source = await readFile(new URL("./onStreetAdminInspectionsRepository.js", import.meta.url), "utf8");

test("§30/32: la consulta principal de fiscalizaciones SIEMPRE filtra por parking_id en el alcance de la empresa -- nunca puede devolver otra empresa", () => {
  assert.match(source, /\.in\("parking_id",\s*parkingIds\)/, "el listado principal debe seguir acotado a parkingIds del contexto");
});

test("§31/33: los registros sin parking_id (NO_SESSION/OTHER) solo se consultan cuando context.role === ROLES.PLATFORM_ADMIN", () => {
  const guardIndex = source.indexOf('context.role === ROLES.PLATFORM_ADMIN');
  assert.ok(guardIndex >= 0, "debe existir un guard explícito por rol");
  const isNullIndex = source.indexOf('.is("parking_id", null)');
  assert.ok(isNullIndex >= 0, "debe existir la consulta a registros sin parking_id");
  assert.ok(isNullIndex > guardIndex, "la consulta a registros sin parking_id debe estar DENTRO del bloque protegido por el guard de rol, no antes");
});

test("§32: ningún registro sin parking_id se inventa un parking_id ficticio -- se marca location:null y unassigned:true, nunca se rellena con datos falsos", () => {
  assert.match(source, /location:\s*null,\s*inspectorEmail:[^,]+,\s*unassigned:\s*true/, "los registros sin parking_id deben quedar explícitamente marcados, no disfrazados de un lugar real");
});

test("§32: unassignedCount se calcula siempre (incluso 0), nunca queda undefined para company_admin -- permite a la UI decidir cuándo mostrar el aviso", () => {
  assert.match(source, /unassignedCount:\s*unassignedDetail\.length/);
  assert.match(source, /unassignedCount:\s*0/, "los casos vacíos (sin parkingIds/bounds) también devuelven unassignedCount explícito");
});

test("§24 (RBAC Inspector revalidado): este archivo nunca importa ni referencia ROLES.INSPECTOR -- las fiscalizaciones administrativas son de Administradores, no del Inspector de campo", () => {
  assert.doesNotMatch(source, /ROLES\.INSPECTOR/);
});
