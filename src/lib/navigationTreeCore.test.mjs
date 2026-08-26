import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesActivePrefix, isItemActive, isTreeActive, activeTreeKeys, initialExpandedNodes, toggleExpandedNode, filterVisibleTree, projectSingleProductParkingNode } from "./navigationTreeCore.mjs";
import { navigationItems } from "../config/navigation.js";

function findByLabel(items, label) {
  for (const item of items) {
    if (item.label === label) return item;
    const found = item.children && findByLabel(item.children, label);
    if (found) return found;
  }
  return undefined;
}

test("matchesActivePrefix acepta string único", () => {
  assert.equal(matchesActivePrefix("/usuarios", "/usuarios"), true);
  assert.equal(matchesActivePrefix("/usuarios/123", "/usuarios"), true);
  assert.equal(matchesActivePrefix("/usuarios-abc", "/usuarios"), false);
  assert.equal(matchesActivePrefix("/otra-ruta", "/usuarios"), false);
  assert.equal(matchesActivePrefix(null, "/usuarios"), false);
  assert.equal(matchesActivePrefix(undefined, "/usuarios"), false);
});

test("matchesActivePrefix acepta arreglo de prefijos (Estacionamientos agrupa dos apps)", () => {
  const prefixes = ["/estacionamientos", "/on-street-qr"];
  assert.equal(matchesActivePrefix("/estacionamientos", prefixes), true);
  assert.equal(matchesActivePrefix("/estacionamientos/abc/editar", prefixes), true);
  assert.equal(matchesActivePrefix("/on-street-qr/sesiones/42", prefixes), true);
  assert.equal(matchesActivePrefix("/on-street", prefixes), false);
  assert.equal(matchesActivePrefix("/recaudacion", prefixes), false);
});

test("isItemActive exige igualdad exacta de pathname (sin query ni hash)", () => {
  assert.equal(isItemActive("/estacionamientos", "/estacionamientos"), true);
  assert.equal(isItemActive("/estacionamientos", "/estacionamientos?tipo=OFF_STREET"), false);
  assert.equal(isItemActive("/facturacion", "/facturacion#prefacturacion"), true);
});

test("navigationItems: Estacionamientos es el único nodo padre para Off Street / On Street", () => {
  const estacionamientos = navigationItems.find((item) => item.label === "Estacionamientos");
  assert.ok(estacionamientos, "debe existir el ítem Estacionamientos");
  assert.equal(estacionamientos.href, "/estacionamientos");
  assert.deepEqual(estacionamientos.activePrefix, ["/estacionamientos", "/on-street-qr"]);
  assert.equal(estacionamientos.children.length, 2);
  assert.deepEqual(estacionamientos.children.map((c) => c.label), ["Off Street", "On Street"]);

  // No debe quedar ningún nodo top-level paralelo representando On Street
  // (antiguo "QR Parking") — consolidado dentro de Estacionamientos.
  assert.equal(navigationItems.some((item) => item.label === "QR Parking"), false);
});

test("Off Street reutiliza la app existente de estacionamientos (sin inventar ruta nueva)", () => {
  const offStreet = findByLabel(navigationItems, "Off Street");
  assert.ok(offStreet);
  assert.equal(offStreet.href, "/estacionamientos?tipo=OFF_STREET");
  assert.equal(offStreet.activePrefix, "/estacionamientos");
});

test("On Street apunta al módulo administrativo real (/on-street-qr) y conserva sus sub-funciones", () => {
  const onStreet = findByLabel(navigationItems, "On Street");
  assert.ok(onStreet);
  assert.equal(onStreet.href, "/on-street-qr");
  assert.equal(onStreet.activePrefix, "/on-street-qr");
  assert.deepEqual(
    onStreet.children.map((c) => c.href),
    [
      "/on-street-qr",
      "/on-street-qr/ubicaciones",
      "/on-street-qr/crear",
      "/on-street-qr/sesiones",
      "/on-street-qr/tarifas",
      "/on-street-qr/pagos",
      "/on-street-qr/administradores",
      "/on-street-qr/operadores",
      "/on-street-qr/reportes",
      "/on-street-qr/areas/nueva",
      "/on-street-qr/calles/nueva",
      "/on-street-qr/tramos/nuevo",
    ],
  );
  assert.equal(onStreet.children[0].label, "Dashboard");
});

test("isTreeActive: Estacionamientos permanece activo/expandido en cualquier ruta hija de ambos módulos", () => {
  const estacionamientos = navigationItems.find((item) => item.label === "Estacionamientos");
  assert.equal(isTreeActive("/estacionamientos", estacionamientos), true);
  assert.equal(isTreeActive("/estacionamientos/abc123/editar", estacionamientos), true);
  assert.equal(isTreeActive("/on-street-qr", estacionamientos), true);
  assert.equal(isTreeActive("/on-street-qr/sesiones/42", estacionamientos), true);
  assert.equal(isTreeActive("/on-street-qr/ubicaciones/9/qr", estacionamientos), true);
  assert.equal(isTreeActive("/recaudacion", estacionamientos), false);
});

test("isTreeActive: On Street y sus 5 hijos activan la rama completa, incluidas rutas de detalle", () => {
  const onStreet = findByLabel(navigationItems, "On Street");
  assert.equal(isTreeActive("/on-street-qr/sesiones", onStreet), true);
  assert.equal(isTreeActive("/on-street-qr/sesiones/session-id-42", onStreet), true);
  assert.equal(isTreeActive("/on-street-qr/ubicaciones/loc-1/letrero", onStreet), true);
  assert.equal(isTreeActive("/estacionamientos", onStreet), false);
});

test("usuario cierra carpeta activa y no se reabre sola en el mismo pathname", () => {
  const afterManualClose = toggleExpandedNode(["Tarifas"], "Tarifas");
  assert.deepEqual(afterManualClose, []);
  assert.deepEqual(afterManualClose, [], "un rerender conserva la misma fuente de verdad");
});

test("navegar explícitamente a un hijo abre todos sus ancestros una sola vez", () => {
  const items = [{ label: "Estacionamientos", activePrefix: ["/estacionamientos", "/on-street-qr"], children: [{ label: "On Street", activePrefix: "/on-street-qr", children: [{ label: "Sesiones", href: "/on-street-qr/sesiones" }] }] }];
  assert.deepEqual(activeTreeKeys(items, "/on-street-qr/sesiones"), ["Estacionamientos", "Estacionamientos/On Street"]);
});

test("Tarifas y Dispositivos mantienen decisiones independientes", () => {
  const result = toggleExpandedNode(["Tarifas", "Dispositivos"], "Tarifas");
  assert.deepEqual(result, ["Dispositivos"]);
});

test("Sidebar separa carpetas y hojas sin navegación de padres ni fallback a Inicio", async () => {
  const source = await readFile(new URL("../components/layout/Sidebar.js", import.meta.url), "utf8");
  assert.match(source, /childExpanded = openTrees\.includes\(childKey\)/);
  assert.match(source, /expanded = openTrees\.includes\(treeKey\)/);
  assert.match(source, /<button type="button" aria-label={`\$\{expanded/);
  assert.doesNotMatch(source, /<Link href=\{item\.href\}/);
  assert.doesNotMatch(source, /<Link href=\{child\.href\}/);
  assert.doesNotMatch(source, /href=\{[^}]+(?:\|\||\?\?)[^}]*"\/"/);
  assert.doesNotMatch(source, /expanded\s*=.*\|\|\s*matchesActivePrefix/);
  assert.doesNotMatch(source, /childExpanded\s*=.*\|\|\s*matchesActivePrefix/);
  assert.doesNotMatch(source, /requestAnimationFrame|reconcileTreeExpansion/);
  assert.match(source, /<Link key=\{item\.label\} href=\{item\.href\}/, "las hojas conservan navegación");
});

test("árbol de tercer nivel abre y cierra cada carpeta por clave jerárquica", () => {
  let expanded = toggleExpandedNode([], "Estacionamientos");
  expanded = toggleExpandedNode(expanded, "Estacionamientos/On Street");
  assert.deepEqual(expanded, ["Estacionamientos", "Estacionamientos/On Street"]);
  expanded = toggleExpandedNode(expanded, "Estacionamientos/On Street");
  assert.deepEqual(expanded, ["Estacionamientos"]);
});

test("remount y localStorage respetan una decisión persistida de cerrar todo", () => {
  const items = [{ label: "Tarifas", activePrefix: "/tarifas", children: [{ label: "Tarifas", href: "/tarifas" }] }];
  assert.deepEqual(initialExpandedNodes({ storedOpenKeys: [], items, pathname: "/tarifas" }), []);
});

test("Sidebar persiste el toggle antes de que una navegación pueda desmontarlo", async () => {
  const source = await readFile(new URL("../components/layout/Sidebar.js", import.meta.url), "utf8");
  assert.match(source, /const next = toggleExpandedNode\(current, key\)/);
  assert.match(source, /localStorage\.setItem\(SIDEBAR_TREES_STORAGE_KEY, JSON\.stringify\(next\)\)/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*window\.localStorage\.setItem\(SIDEBAR_TREES_STORAGE_KEY/);
});

test("cerrar una carpeta, remontar en otra ruta y volver conserva la decisión", () => {
  const items = [
    { label: "Tarifas", activePrefix: "/tarifas", children: [{ label: "Tarifas", href: "/tarifas" }] },
    { label: "Usuarios", activePrefix: "/usuarios", children: [{ label: "Administradores", href: "/usuarios/administradores" }] },
  ];
  const persistedAfterClose = toggleExpandedNode(["Tarifas"], "Tarifas");
  assert.deepEqual(initialExpandedNodes({ storedOpenKeys: persistedAfterClose, items, pathname: "/usuarios/administradores" }), []);
  assert.deepEqual(initialExpandedNodes({ storedOpenKeys: persistedAfterClose, items, pathname: "/tarifas" }), []);
});

test("sin persistencia, la ruta solo determina la expansión inicial", () => {
  const items = [{ label: "Usuarios", activePrefix: "/usuarios", children: [{ label: "Administradores", href: "/usuarios/administradores" }] }];
  assert.deepEqual(initialExpandedNodes({ storedOpenKeys: null, items, pathname: "/usuarios/administradores" }), ["Usuarios"]);
});

test("MobileNavigation no escribe el localStorage del Sidebar desktop", async () => {
  const source = await readFile(new URL("../components/layout/MobileNavigation.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|parkfacil\.sidebar\.expanded/);
});

test("Configuración On Street reutiliza ParkingRatesManager sin saltar a rutas Off Street", async () => {
  const source = await readFile(new URL("../components/on-street-admin/OnStreetTarifasWorkspace.js", import.meta.url), "utf8");
  assert.match(source, /import ParkingRatesManager from "@\/components\/estacionamientos\/ParkingRatesManager"/);
  assert.match(source, /<ParkingRatesManager key=\{selectedParking\.id\} parking=\{selectedParking\}/);
  assert.doesNotMatch(source, /href=\{`\/estacionamientos\/\$\{p\.code\}/);
});

test("carpetas homónimas en ramas distintas conservan claves independientes", () => {
  const items = [{ label: "A", activePrefix: "/a", children: [{ label: "Reportes", activePrefix: "/a/reportes", children: [{ label: "Uno", href: "/a/reportes/uno" }] }] }, { label: "B", activePrefix: "/b", children: [{ label: "Reportes", activePrefix: "/b/reportes", children: [{ label: "Dos", href: "/b/reportes/dos" }] }] }];
  assert.deepEqual(activeTreeKeys(items, "/b/reportes/dos"), ["B", "B/Reportes"]);
});

// --- Acceso diferenciado por producto: promoción de "Estacionamientos" a
// nivel superior para un Cliente con un único producto (ver §17/§18 de la
// auditoría de acceso por producto) ---

// Regresión: un padre cuyo propio href requiere un producto (p. ej.
// "Estacionamientos" -> Off Street) no debe desaparecer del árbol solo
// porque ese href puntual no es visible, si al menos un hijo sigue siéndolo
// -- de lo contrario un Cliente exclusivamente On Street pierde el nodo
// ANTES de que projectSingleProductParkingNode pueda promover "On Street" en
// su lugar, y el Sidebar le queda completamente sin entrada a su único
// producto (bug detectado en la validación QA de acceso por producto).
test("filterVisibleTree: el padre sobrevive si tiene al menos un hijo visible, aunque su propio href no lo sea", () => {
  const estacionamientos = { href: "/estacionamientos", label: "Estacionamientos", children: [
    { href: "/estacionamientos?tipo=OFF_STREET", label: "Off Street" },
    { href: "/on-street-qr", label: "On Street" },
  ] };
  const items = [{ href: "/", label: "Inicio" }, estacionamientos];
  // Simula un Cliente exclusivamente On Street: solo "On Street" es visible
  // (ni "Estacionamientos" propio ni "Off Street" lo son).
  const isVisible = (item) => item.label === "Inicio" || item.label === "On Street";
  const filtered = filterVisibleTree(items, isVisible);
  assert.deepEqual(filtered.map((item) => item.label), ["Inicio", "Estacionamientos"]);
  assert.deepEqual(filtered[1].children.map((child) => child.label), ["On Street"]);
});

test("filterVisibleTree: el padre desaparece si ningún hijo es visible y su propio href tampoco", () => {
  const estacionamientos = { href: "/estacionamientos", label: "Estacionamientos", children: [
    { href: "/estacionamientos?tipo=OFF_STREET", label: "Off Street" },
    { href: "/on-street-qr", label: "On Street" },
  ] };
  const items = [{ href: "/", label: "Inicio" }, estacionamientos];
  const isVisible = (item) => item.label === "Inicio";
  const filtered = filterVisibleTree(items, isVisible);
  assert.deepEqual(filtered.map((item) => item.label), ["Inicio"]);
});

test("filterVisibleTree + projectSingleProductParkingNode: extremo a extremo -- Cliente exclusivamente On Street ve \"On Street\" en el Sidebar", () => {
  const onStreet = findByLabel(navigationItems, "On Street");
  const isVisible = (item) => item.label !== "Off Street" && item.label !== "On Street" ? true : item.label === "On Street";
  const filtered = filterVisibleTree(navigationItems, isVisible);
  const projected = projectSingleProductParkingNode(filtered);
  const promoted = projected.find((item) => item.label === "On Street");
  assert.ok(promoted, "\"On Street\" debe estar presente y promovido, no desaparecer del árbol");
  assert.equal(promoted.href, "/on-street-qr");
  assert.deepEqual(promoted.children, onStreet.children);
  assert.equal(projected.some((item) => item.label === "Estacionamientos"), false);
});

test("projectSingleProductParkingNode: con ambos hijos visibles (ambos productos, o Root) no cambia nada", () => {
  const estacionamientos = navigationItems.find((item) => item.label === "Estacionamientos");
  const items = [{ href: "/", label: "Inicio" }, estacionamientos, { href: "/usuarios", label: "Usuarios" }];
  const projected = projectSingleProductParkingNode(items);
  assert.deepEqual(projected, items);
});

test("projectSingleProductParkingNode: Cliente solo On Street -- \"Estacionamientos\" se reemplaza por \"On Street\" promovido, con sus propios hijos", () => {
  const onStreet = findByLabel(navigationItems, "On Street");
  const estacionamientosOnStreetOnly = { href: "/estacionamientos", label: "Estacionamientos", children: [onStreet] };
  const items = [{ href: "/", label: "Inicio" }, estacionamientosOnStreetOnly, { href: "/usuarios", label: "Usuarios" }];
  const projected = projectSingleProductParkingNode(items);
  assert.deepEqual(projected.map((item) => item.label), ["Inicio", "On Street", "Usuarios"]);
  assert.equal(projected[1].href, "/on-street-qr");
  assert.deepEqual(projected[1].children, onStreet.children);
});

test("projectSingleProductParkingNode: Cliente solo Off Street -- \"Estacionamientos\" se reemplaza por \"Off Street\" promovido", () => {
  const offStreet = { href: "/estacionamientos?tipo=OFF_STREET", label: "Off Street", activePrefix: "/estacionamientos" };
  const estacionamientosOffStreetOnly = { href: "/estacionamientos", label: "Estacionamientos", children: [offStreet] };
  const items = [estacionamientosOffStreetOnly];
  const projected = projectSingleProductParkingNode(items);
  assert.deepEqual(projected, [offStreet]);
});

test("projectSingleProductParkingNode: Cliente sin ningún producto -- el nodo desaparece por completo", () => {
  const estacionamientosSinProductos = { href: "/estacionamientos", label: "Estacionamientos", children: [] };
  const items = [{ href: "/", label: "Inicio" }, estacionamientosSinProductos];
  const projected = projectSingleProductParkingNode(items);
  assert.deepEqual(projected.map((item) => item.label), ["Inicio"]);
});
