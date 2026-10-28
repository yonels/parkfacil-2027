// Ficha de la propia empresa en modo solo lectura (2026-10-28).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { canAccessPath, isOwnCompanyPage, PRODUCTS, ROLES } from "./permissions.mjs";

const admin = { portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: [PRODUCTS.OFF_STREET], companyId: "emp-001" };

test("el administrador abre solo la ficha de su propia empresa", () => {
  assert.equal(canAccessPath(admin, "/empresas/emp-001"), true);
  assert.equal(canAccessPath(admin, "/empresas/emp-002"), false);
  assert.equal(canAccessPath(admin, "/empresas"), false);
  assert.equal(canAccessPath(admin, "/empresas/emp-001/editar"), false);
  assert.equal(canAccessPath(admin, "/contratos/c-001"), false);
});

test("operador, administrador sin empresa y otros portales no la abren", () => {
  assert.equal(canAccessPath({ ...admin, role: ROLES.OPERATOR }, "/empresas/emp-001"), false);
  assert.equal(canAccessPath({ ...admin, companyId: null }, "/empresas/emp-001"), false);
  assert.equal(isOwnCompanyPage({ ...admin, portal: "terminal" }, "/empresas/emp-001"), false);
});

test("Root conserva el acceso completo a empresas", () => {
  const root = { portal: "root", role: ROLES.PLATFORM_ADMIN, enabledProducts: [], companyId: null };
  assert.equal(canAccessPath(root, "/empresas"), true);
  assert.equal(canAccessPath(root, "/empresas/emp-002"), true);
});

test("la ficha muestra el aviso y oculta las acciones de Root en modo lectura", async () => {
  const page = await readFile(new URL("../../app/empresas/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /Página solo de lectura/);
  assert.match(page, /soloLectura \? null : <EmpresaEditButton/);
  assert.match(page, /soloLectura \? null : <EmpresaBoletaElectronicaEstado/);
  assert.match(page, /soloLectura \? null : <EmpresaEnrolamientoPanel/);
  assert.match(page, /context\?\.companyId !== id/);
});

test("la pantalla de acceso denegado del portal Cliente vuelve al inicio, no al Terminal", async () => {
  const proxy = await readFile(new URL("../../proxy.js", import.meta.url), "utf8");
  assert.match(proxy, /context\?\.portal === "client"\s*\?\s*`<a href="\/">Volver al inicio<\/a>`/);
});
