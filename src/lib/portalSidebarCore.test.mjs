import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navigationItems } from "../config/navigation.js";
import { navigationVisibleForRole } from "./auth/permissions.mjs";
import { countMenuOptions, filterMenuTree, formatCompanyRut, hideUnhiredProducts, portalMenuSections, ROOT_MENU_SECTIONS, searchEntities } from "./portalSidebarCore.mjs";
import { filterVisibleTree, projectClientAdministrationNode, projectSingleProductParkingNode } from "./navigationTreeCore.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const clientItems = (products) => {
  const context = { portal: "client", role: "company_admin", enabledProducts: products, couponModuleStatus: "ACTIVE" };
  return hideUnhiredProducts(projectClientAdministrationNode(projectSingleProductParkingNode(filterVisibleTree(navigationItems, (item) => navigationVisibleForRole(item, context)))), products);
};
const labels = (sections) => sections.flatMap((section) => section.items.map((item) => item.label));

test("Off Street va arriba y On Street inmediatamente debajo", () => {
  const order = labels(portalMenuSections(clientItems(["OFF_STREET", "ON_STREET"])));
  assert.deepEqual(order.slice(0, 2), ["Off Street", "On Street"]);
});

test("con un solo producto no aparece el otro", () => {
  assert.equal(labels(portalMenuSections(clientItems(["OFF_STREET"]))).includes("On Street"), false);
  assert.equal(labels(portalMenuSections(clientItems(["ON_STREET"]))).includes("Off Street"), false);
});

test("el nuevo orden conserva exactamente las opciones permitidas", () => {
  for (const products of [["OFF_STREET"], ["ON_STREET"], ["OFF_STREET", "ON_STREET"]]) {
    const items = clientItems(products);
    assert.deepEqual(labels(portalMenuSections(items)).sort(), items.map((item) => item.label).sort());
  }
});

test("una opción sin ubicar queda en Administración y no desaparece", () => {
  const sections = portalMenuSections([{ label: "Opción nueva", href: "/nueva" }]);
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

test("buscar empresas por nombre, razón social o RUT con las primeras letras o números", () => {
  const datos = {
    companies: [
      { id: "a", nombreFantasia: "Viapark", razonSocial: "Inversiones Vía Park SpA", rutNumero: "76123456", rutDv: "K" },
      { id: "b", nombreFantasia: "Clínica Ramis", razonSocial: "Sociedad Médica Integral", rutNumero: "76345890", rutDv: "2" },
    ],
    parkings: [{ id: "p", code: "PC-001", name: "Parking Centro", companyName: "ParkFacil Operaciones" }],
  };
  const ids = (q) => searchEntities(datos, q).companies.map((c) => c.id);
  assert.deepEqual(ids("via"), ["a"]);
  assert.deepEqual(ids("VÍA PA"), ["a"]);
  assert.deepEqual(ids("clinica"), ["b"]);
  assert.deepEqual(ids("medica"), ["b"]);
  assert.deepEqual(ids("76.12"), ["a"]);
  assert.deepEqual(ids("763458902"), ["b"]);
  assert.deepEqual(ids("76"), ["a", "b"]);
  assert.deepEqual(ids("zzz"), []);
  assert.deepEqual(searchEntities(datos, "pc-0").parkings.map((p) => p.id), ["p"]);
  assert.deepEqual(searchEntities(datos, "operaciones").parkings.map((p) => p.id), ["p"]);
  assert.deepEqual(searchEntities(datos, " "), { companies: [], parkings: [] });
});

test("el RUT se muestra con puntos y dígito verificador", () => {
  assert.equal(formatCompanyRut("77991619", "7"), "77.991.619-7");
  assert.equal(formatCompanyRut("7681327", "k"), "7.681.327-K");
  assert.equal(formatCompanyRut("", "7"), "");
});

test("Root conserva todas sus opciones, con Off Street y On Street arriba", () => {
  const context = { portal: "root", role: "platform_admin", enabledProducts: ["OFF_STREET", "ON_STREET"] };
  const items = filterVisibleTree(navigationItems, (item) => navigationVisibleForRole(item, context));
  const sections = portalMenuSections(items, ROOT_MENU_SECTIONS);
  assert.deepEqual(labels(sections).sort(), items.map((item) => item.label).sort());
  assert.deepEqual(labels(sections).slice(0, 2), ["Off Street", "On Street"]);
  const admin = items.find((item) => item.label === "Administración");
  for (const label of ["Empresas", "Configurar empresa", "Usuarios"]) assert.ok(admin.children.some((child) => child.label === label), label);
  // Facturación es opción propia del menú (SOL-2026-11-05-005), en la sección Administración.
  assert.ok(!admin.children.some((child) => child.label === "Facturación"));
  const adminSection = sections.find((section) => section.id === "administracion");
  assert.deepEqual(adminSection.items.map((item) => item.label), ["Centro de Control SMS", "Facturación", "Administración"]);
  assert.equal(items.find((item) => item.label === "Facturación").children.length, 11);
});

test("los portales Cliente y Root usan el menú nuevo; los demás, el anterior", () => {
  const shell = read("../components/layout/AppShell.js");
  assert.match(shell, /PORTALS_WITH_NEW_MENU = \["client", "root"\]/);
  assert.match(shell, /<PortalSidebar/);
  assert.match(shell, /<Sidebar/);
  assert.match(shell, /setClientMenuOpen\(true\)/);
  const session = read("../app/api/auth/session/route.js");
  assert.match(session, /context\.portal !== "client" \|\| !context\.companyId/);
  assert.match(session, /\.eq\("id", context\.companyId\)/);
  const sidebar = read("../components/layout/PortalSidebar.js");
  assert.match(sidebar, /navigationVisibleForRole\(item, userContext\)/);
});
