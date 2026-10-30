// «Data Entry» como demostración solo en Root (SOL-2026-10-30-003, 2026-10-30).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { navigationItems } from "../config/navigation.js";
import { canAccessPath, navigationVisibleForRole, PRODUCTS, ROLES } from "./auth/permissions.mjs";

const item = navigationItems.find((entry) => entry.label === "Data Entry");
const root = { portal: "root", role: ROLES.PLATFORM_ADMIN };
const client = { portal: "client", companyId: "emp-001", enabledProducts: [PRODUCTS.OFF_STREET] };

test("«Data Entry» de Root abre la demostración y no el login de operador", () => {
  assert.equal(item.href, "/administracion/data-entry-demo");
  assert.equal(item.platformAdminGateway, undefined);
  assert.equal(navigationVisibleForRole(item, root), true);
});

test("«Data Entry» no se muestra a administradores ni operadores del Portal Cliente", () => {
  assert.equal(navigationVisibleForRole(item, { ...client, role: ROLES.COMPANY_ADMIN }), false);
  assert.equal(navigationVisibleForRole(item, { ...client, role: ROLES.OPERATOR }), false);
  assert.equal(canAccessPath({ ...client, role: ROLES.COMPANY_ADMIN }, "/administracion/data-entry-demo"), false);
});

test("la demostración no llama a ninguna API ni a la impresora", async () => {
  const demo = await readFile(new URL("../../public/demo-pos/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(demo, /fetch\(|XMLHttpRequest|127\.0\.0\.1|\/api\//);
  assert.match(demo, /MODO DEMOSTRACIÓN/);
});
