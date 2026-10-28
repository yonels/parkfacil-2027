// SOL-2026-10-20-001 (2026-10-28): acceso directo a Boleta electrónica en el
// menú Off Street > Tarifas, con la visibilidad ya definida en permissions.mjs.
import test from "node:test";
import assert from "node:assert/strict";

import { filterVisibleTree, isItemActive } from "./navigationTreeCore.mjs";
import { navigationItems } from "../config/navigation.js";
import { canAccessPath, PRODUCTS, ROLES } from "./auth/permissions.mjs";

const RUTA = "/tarifas/modulos/boleta-electronica";

function buscar(items, href) {
  for (const item of items) {
    if (item.href === href && !item.children?.length) return item;
    const hijo = buscar(item.children || [], href);
    if (hijo) return hijo;
  }
  return null;
}

function carpetaTarifas(items) {
  for (const item of items) {
    if (item.label === "Tarifas" && item.children?.length) return item;
    const dentro = carpetaTarifas(item.children || []);
    if (dentro) return dentro;
  }
  return null;
}

test("el menú Tarifas incluye Boleta electrónica después de Simulador de tarifas", () => {
  const tarifas = carpetaTarifas(navigationItems);
  assert.ok(tarifas);
  assert.deepEqual(tarifas.children.map((c) => c.label), ["Tarifas", "Planes", "Simulador de tarifas", "Boleta electrónica"]);
  assert.ok(isItemActive(RUTA, buscar(navigationItems, RUTA).href));
});

const visible = (ctx) => buscar(filterVisibleTree(navigationItems, (item) => !item.href || canAccessPath(ctx, item.href)), RUTA) !== null;

test("lo ve el administrador de empresa con Off Street y Root", () => {
  assert.equal(visible({ portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: [PRODUCTS.OFF_STREET] }), true);
  assert.equal(visible({ portal: "root", role: ROLES.PLATFORM_ADMIN, enabledProducts: [] }), true);
});

test("no lo ve el operador ni una empresa sin Off Street", () => {
  assert.equal(visible({ portal: "client", role: ROLES.OPERATOR, enabledProducts: [PRODUCTS.OFF_STREET] }), false);
  assert.equal(visible({ portal: "client", role: ROLES.COMPANY_ADMIN, enabledProducts: [PRODUCTS.ON_STREET] }), false);
});
