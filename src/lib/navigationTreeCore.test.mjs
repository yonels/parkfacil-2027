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

// ============================================================
// Reorganización 2026-08-28 ("4 pilares"): Off Street y On Street pasaron
// de ser dos hijos de un mismo nodo "Estacionamientos" a ser dos árboles de
// PRIMER NIVEL, hermanos entre sí -- ya no existe ningún nodo con label
// "Estacionamientos" en navigationItems (sí sigue existiendo la ruta real
// /estacionamientos, ahora como hoja dentro de Off Street > Estacionamientos).
// ============================================================

test("navigationItems: Off Street y On Street son árboles de primer nivel independientes (ya no hay un nodo 'Estacionamientos' que los contenga)", () => {
  assert.equal(navigationItems.some((item) => item.label === "Estacionamientos"), false, "no debe quedar ningún nodo top-level 'Estacionamientos' combinando ambos productos");
  const offStreet = navigationItems.find((item) => item.label === "Off Street");
  const onStreet = navigationItems.find((item) => item.label === "On Street");
  assert.ok(offStreet, "Off Street debe existir como ítem de primer nivel");
  assert.ok(onStreet, "On Street debe existir como ítem de primer nivel");
  assert.equal(navigationItems.includes(offStreet) && navigationItems.includes(onStreet), true, "ambos deben ser elementos directos del arreglo de primer nivel, no anidados entre sí");
  // No debe quedar ningún nodo top-level paralelo representando On Street
  // (antiguo "QR Parking") — consolidado en su propio árbol.
  assert.equal(navigationItems.some((item) => item.label === "QR Parking"), false);
});

test("Off Street reutiliza la app existente de estacionamientos (sin inventar ruta nueva), agrupada bajo Estacionamientos > Estacionamientos", () => {
  const offStreet = navigationItems.find((item) => item.label === "Off Street");
  // El grupo "Off Street" en sí es una carpeta (sin href propio) -- el href
  // real de la app tradicional vive en su hoja "Estacionamientos", dentro
  // del sub-grupo homónimo (ver §3/§4 de la reorganización).
  assert.equal(offStreet.href, undefined);
  assert.ok(Array.isArray(offStreet.activePrefix) && offStreet.activePrefix.includes("/estacionamientos"));
  const estacionamientosGrupo = offStreet.children.find((c) => c.label === "Estacionamientos");
  assert.ok(estacionamientosGrupo, "debe existir el sub-grupo Estacionamientos dentro de Off Street");
  const estacionamientosHoja = estacionamientosGrupo.children.find((c) => c.label === "Estacionamientos");
  assert.ok(estacionamientosHoja);
  assert.equal(estacionamientosHoja.href, "/estacionamientos?tipo=OFF_STREET");
  assert.equal(estacionamientosHoja.activePrefix, "/estacionamientos");
});

test("On Street apunta al módulo administrativo real (/on-street-qr), conserva sus sub-funciones y ya no incluye Administradores/Operadores", () => {
  const onStreet = navigationItems.find((item) => item.label === "On Street");
  assert.ok(onStreet);
  assert.equal(onStreet.href, "/on-street-qr");
  assert.equal(onStreet.activePrefix, "/on-street-qr");

  const allLabels = (items) => items.flatMap((i) => [i.label, ...(i.children ? allLabels(i.children) : [])]);
  const labels = allLabels(onStreet.children);

  // §7/§29 de la reorganización: Administradores/Operadores SACADOS del
  // árbol On Street (viven en Administración > Usuarios). Inspectores SÍ
  // permanece (operación de terreno).
  assert.equal(labels.includes("Administradores"), false);
  assert.equal(labels.includes("Operadores"), false);
  assert.ok(labels.includes("Inspectores"));

  // "Proyectos On Street" (§ UX "Proyectos On Street" 2026-08-28) reemplazó
  // al grupo "Ubicaciones" como experiencia PRINCIPAL: Ubicaciones QR/
  // Generar QR/Áreas/Calles/Tramos ya no son accesos directos del menú
  // (siguen existiendo como rutas reales, ver onStreetProjects.test.mjs) --
  // ahora se administran desde "Proyectos actuales"/la ficha de Proyecto/el
  // constructor "Nuevo proyecto".
  assert.equal(onStreet.children.some((c) => c.label === "Ubicaciones"), false, "el grupo 'Ubicaciones' ya no debe existir -- reemplazado por Proyectos On Street");
  const proyectos = onStreet.children.find((c) => c.label === "Proyectos On Street");
  assert.ok(proyectos, "debe existir 'Proyectos On Street'");
  assert.equal(proyectos.href, "/on-street-qr/proyectos");
  assert.deepEqual(proyectos.children.map((c) => c.label), ["Proyectos actuales", "Nuevo proyecto"]);
  assert.equal(labels.includes("Generar QR"), false, "'Generar QR' ya no es un ítem del menú principal -- se accede desde 'Guardar y generar QR' en el constructor de Proyecto");

  assert.equal(onStreet.children[0].label, "Dashboard");
  assert.equal(onStreet.children[0].href, "/on-street-qr");
});

// Corrección UX/funcional 2026-08-29: al retirar el grupo "Ubicaciones" (ver
// test anterior), Áreas/Calles/Tramos dejaron de tener acceso directo desde
// el menú -- solo se llegaba a ellas creando un Proyecto nuevo. "Estructura"
// restaura ese acceso sin resucitar "Ubicaciones" ni duplicar páginas: enlaza
// las MISMAS rutas ya existentes (src/app/on-street-qr/{areas,calles,tramos}).
test("On Street: 'Estructura' da acceso directo a Áreas/Calles/Tramos, reutilizando las rutas existentes sin duplicarlas", () => {
  const onStreet = findByLabel(navigationItems, "On Street");
  assert.ok(onStreet);
  assert.equal(onStreet.children.some((c) => c.label === "Ubicaciones"), false, "no debe resucitar el grupo 'Ubicaciones'");

  const estructura = onStreet.children.find((c) => c.label === "Estructura");
  assert.ok(estructura, "debe existir el grupo 'Estructura' dentro de On Street");
  assert.deepEqual(estructura.children.map((c) => c.label), ["Áreas", "Calles", "Tramos"]);
  assert.equal(estructura.children.find((c) => c.label === "Áreas").href, "/on-street-qr/areas");
  assert.equal(estructura.children.find((c) => c.label === "Calles").href, "/on-street-qr/calles");
  assert.equal(estructura.children.find((c) => c.label === "Tramos").href, "/on-street-qr/tramos");

  // Ninguna otra rama de On Street repite estos mismos labels/hrefs -- un
  // solo punto de acceso por entidad, no una segunda pantalla inventada.
  const allLabels = (items) => items.flatMap((i) => [i.label, ...(i.children ? allLabels(i.children) : [])]);
  const labels = allLabels(onStreet.children);
  assert.equal(labels.filter((label) => label === "Áreas").length, 1);
  assert.equal(labels.filter((label) => label === "Calles").length, 1);
  assert.equal(labels.filter((label) => label === "Tramos").length, 1);

  // "Proyectos On Street" ya no reclama /areas, /calles, /tramos en su
  // activePrefix -- esa responsabilidad pasó a "Estructura" (evita que dos
  // ramas del árbol se resalten/expandan simultáneamente para la misma URL).
  const proyectos = onStreet.children.find((c) => c.label === "Proyectos On Street");
  for (const prefix of ["/on-street-qr/areas", "/on-street-qr/calles", "/on-street-qr/tramos"]) {
    assert.equal(proyectos.activePrefix.includes(prefix), false, `"Proyectos On Street" ya no debe incluir ${prefix} en su activePrefix`);
    assert.equal(estructura.activePrefix.includes(prefix), true, `"Estructura" debe incluir ${prefix} en su activePrefix`);
  }

  // Cada URL real activa la rama "Estructura" (y no "Proyectos On Street").
  assert.equal(isTreeActive("/on-street-qr/areas", estructura), true);
  assert.equal(isTreeActive("/on-street-qr/areas/abc123", estructura), true);
  assert.equal(isTreeActive("/on-street-qr/calles", estructura), true);
  assert.equal(isTreeActive("/on-street-qr/tramos", estructura), true);
  assert.equal(isTreeActive("/on-street-qr/areas", proyectos), false);
});

test("isTreeActive: Off Street y On Street son ramas independientes -- ninguna activa a la otra", () => {
  const offStreet = navigationItems.find((item) => item.label === "Off Street");
  const onStreet = navigationItems.find((item) => item.label === "On Street");
  assert.equal(isTreeActive("/estacionamientos", offStreet), true);
  assert.equal(isTreeActive("/estacionamientos/abc123/editar", offStreet), true);
  assert.equal(isTreeActive("/operacion", offStreet), true);
  assert.equal(isTreeActive("/on-street-qr", offStreet), false, "On Street no debe activar la rama Off Street");
  assert.equal(isTreeActive("/on-street-qr", onStreet), true);
  assert.equal(isTreeActive("/on-street-qr/sesiones/42", onStreet), true);
  assert.equal(isTreeActive("/estacionamientos", onStreet), false, "Off Street no debe activar la rama On Street");
  assert.equal(isTreeActive("/recaudacion", offStreet), true);
  assert.equal(isTreeActive("/recaudacion", onStreet), false);
});

test("Administración: Usuarios (Administradores/Operadores) vive en el árbol Administración, no duplicado en On Street", () => {
  const administracion = navigationItems.find((item) => item.label === "Administración");
  assert.ok(administracion);
  const usuarios = administracion.children.find((c) => c.label === "Usuarios");
  assert.ok(usuarios);
  assert.deepEqual(usuarios.children.map((c) => c.label), ["Administradores", "Operadores"]);
});

test("Dashboard General (Plataforma) es una ruta distinta del Dashboard de On Street", () => {
  const dashboardGeneral = navigationItems.find((item) => item.label === "Dashboard General");
  const onStreet = navigationItems.find((item) => item.label === "On Street");
  assert.ok(dashboardGeneral);
  assert.equal(dashboardGeneral.href, "/modelo-dashboard");
  assert.notEqual(dashboardGeneral.href, onStreet.href);
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

// Tras la reorganización 2026-08-28, navigationItems ya no tiene ningún
// nodo con label "Estacionamientos" (Off Street y On Street son árboles de
// primer nivel independientes) -- projectSingleProductParkingNode() no
// encuentra ningún nodo que coincida y queda como una operación identidad
// sobre el árbol real. Sigue siendo una función pura útil (y probada más
// abajo con fixtures propios) para el caso hipotético de reintroducir un
// nodo combinado, pero contra navigationItems real hoy es un no-op -- este
// test documenta explícitamente ese hecho para que no se asuma "promoción"
// donde ya no aplica.
test("projectSingleProductParkingNode: contra navigationItems real (sin nodo 'Estacionamientos' combinado) es una operación identidad", () => {
  const projected = projectSingleProductParkingNode(navigationItems);
  assert.deepEqual(projected, navigationItems);
  assert.equal(navigationItems.some((item) => item.label === "Estacionamientos"), false);
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
