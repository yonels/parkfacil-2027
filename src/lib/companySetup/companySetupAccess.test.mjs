// «Configurar empresa» (SOL-2026-10-29-014): la opción del menú y la ruta son
// solo de Root, y conviven con «Empresas».
import test from "node:test";
import assert from "node:assert/strict";

import { canAccessPath, PRODUCTS, ROLES } from "../auth/permissions.mjs";
import { navigationItems } from "../../config/navigation.js";

const PATH = "/administracion/configurar-empresa";

test("solo Root abre «Configurar empresa»", () => {
  assert.equal(canAccessPath({ portal: "root", role: ROLES.PLATFORM_ADMIN }, PATH), true);
  const client = { portal: "client", companyId: "emp-001", enabledProducts: [PRODUCTS.OFF_STREET] };
  assert.equal(canAccessPath({ ...client, role: ROLES.COMPANY_ADMIN }, PATH), false);
  assert.equal(canAccessPath({ ...client, role: ROLES.OPERATOR }, PATH), false);
});

test("el menú ofrece «Configurar empresa» junto a «Empresas» en Administración", () => {
  const administration = navigationItems.find((item) => item.label === "Administración");
  const labels = administration.children.map((child) => child.label);
  assert.equal(labels[labels.indexOf("Empresas") + 1], "Configurar empresa");
  assert.equal(administration.children.find((child) => child.label === "Configurar empresa").href, PATH);
});
