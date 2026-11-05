import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navigationItems } from "../config/navigation.js";
import { navigationVisibleForRole } from "./auth/permissions.mjs";
import { clientMenuSections, countMenuOptions, filterMenuTree, formatCompanyRut, hideUnhiredProducts } from "./clientSidebarCore.mjs";
import { filterVisibleTree, projectClientAdministrationNode, projectSingleProductParkingNode } from "./navigationTreeCore.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const clientItems = (products) => {
  const context = { portal: "client", role: "company_admin", enabledProducts: products, couponModuleStatus: "ACTIVE" };
  return hideUnhiredProducts(projectClientAdministrationNode(projectSingleProductParkingNode(filterVisibleTree(navigationItems, (item) => navigationVisibleForRole(item, context)))), products);
};
const labels = (sections) => sections.flatMap((section) => section.items.map((item) => item.label));

test("Off Street va arriba y On Street inmediatamente debajo", () => {
  const order = labels(clientMenuSections(clientItems(["OFF_STREET", "ON_STREET"])));
  assert.deepEqual(order.slice(0, 2), ["Off Street", "On Street"]);
});

test("con un solo producto no aparece el otro", () => {
  assert.equal(labels(clientMenuSections(clientItems(["OFF_STREET"]))).includes("On Street"), false);
  assert.equal(labels(clientMenuSections(clientItems(["ON_STREET"]))).includes("Off Street"), false);
});

test("el nuevo orden conserva exactamente las opciones permitidas", () => {
  for (const products of [["OFF_STREET"], ["ON_STREET"], ["OFF_STREET", "ON_STREET"]]) {
    const items = clientItems(products);
    assert.deepEqual(labels(clientMenuSections(items)).sort(), items.map((item) => item.label).sort());
  }
});

test("una opción sin ubicar queda en Administración y no desaparece", () => {
  const sections = clientMenuSections([{ label: "Opción nueva", href: "/nueva" }]);
  assert.equal(sections[0].id, "administracion");
  assert.equal(sections[0].items[0].label, "Opción nueva");
});

test("la búsqueda ignora tildes, deja el camino al hijo y conserva una carpeta completa", () => {
  const tree = [{ label: "Off Street", children: [{ label: "Recaudación", children: [{ label: "Pagos", href: "/a" }, { label: "Pagos con tarjeta", href: "/b" }] }, { label: "Monitoreo", href: "/c" }] }];
  assert.deepEqual(filterMenuTree(tree, "TARJETA")[0].children[0].children.map((item) => item.label), ["Pagos con tarjeta"]);
  assert.equal(filterMenuTree(tree, "recaudacion")[0].children[0].children.length, 2);
  assert.deepEqual(filterMenuTree(tree, "inexistente"), []);
  assert.equal(filterMenuTree(tree, " "), tree);
  assert.equal(countMenuOptions(tree[0]), 3);
});

test("el RUT se muestra con puntos y dígito verificador", () => {
  assert.equal(formatCompanyRut("77991619", "7"), "77.991.619-7");
  assert.equal(formatCompanyRut("7681327", "k"), "7.681.327-K");
  assert.equal(formatCompanyRut("", "7"), "");
});

test("solo el Portal Cliente usa el menú nuevo, y la identidad sale de la sesión de esa empresa", () => {
  const shell = read("../components/layout/AppShell.js");
  assert.match(shell, /userContext\?\.portal === "client"/);
  assert.match(shell, /<ClientSidebar/);
  assert.match(shell, /<Sidebar/);
  assert.match(shell, /setClientMenuOpen\(true\)/);
  const session = read("../app/api/auth/session/route.js");
  assert.match(session, /context\.portal !== "client" \|\| !context\.companyId/);
  assert.match(session, /\.eq\("id", context\.companyId\)/);
  const sidebar = read("../components/layout/ClientSidebar.js");
  assert.match(sidebar, /navigationVisibleForRole\(item, userContext\)/);
});
