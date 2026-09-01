import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [bottomNav, sidebar, drawer] = await Promise.all([
  readFile(new URL("./InspectorBottomNav.js", import.meta.url), "utf8"),
  readFile(new URL("./InspectorSidebar.js", import.meta.url), "utf8"),
  readFile(new URL("./InspectorDrawer.js", import.meta.url), "utf8"),
]);

// Regresión: la barra inferior, el sidebar y el drawer usaban el mismo
// aria-label ("Navegación principal" / "Más opciones" en dos elementos a la
// vez), lo que hacía ambiguo cuál elemento resolvía un selector/lector de
// pantalla. Se fija aquí para que no vuelva a ocurrir.
test("la barra inferior, el sidebar y el drawer usan aria-label de navegación distintos entre sí", () => {
  const bottomNavLabel = bottomNav.match(/<nav[^>]*aria-label="([^"]+)"/)?.[1];
  const sidebarLabel = sidebar.match(/<nav[^>]*aria-label="([^"]+)"/)?.[1];
  const drawerLabel = drawer.match(/<nav[^>]*aria-label="([^"]+)"/)?.[1];
  assert.ok(bottomNavLabel && sidebarLabel && drawerLabel, "las 3 barras deben declarar aria-label en su <nav>");
  assert.equal(new Set([bottomNavLabel, sidebarLabel, drawerLabel]).size, 3, `deben ser 3 etiquetas distintas, se encontraron: ${bottomNavLabel}, ${sidebarLabel}, ${drawerLabel}`);
});

test("el botón que abre el drawer también tiene su propio aria-label, distinto del <nav> interno del drawer", () => {
  const triggerLabel = bottomNav.match(/aria-label="Más opciones"/);
  const drawerNavLabel = drawer.match(/<nav aria-label="([^"]+)"/)?.[1];
  assert.ok(triggerLabel, "el botón 'Más' debe tener aria-label");
  assert.notEqual(drawerNavLabel, "Más opciones", "el <nav> del drawer no debe repetir el aria-label del botón que lo abre");
});

test("la barra inferior solo se muestra bajo el punto de quiebre md (móvil), nunca en desktop", () => {
  assert.match(bottomNav, /className="[^"]*md:hidden[^"]*"/);
});

test("el sidebar solo se muestra desde el punto de quiebre md (tablet/desktop), oculto en móvil", () => {
  assert.match(sidebar, /className="[^"]*hidden[^"]*md:flex[^"]*"/);
});

test("el drawer completo es exclusivo de móvil (el sidebar de escritorio ya muestra toda la navegación siempre visible)", () => {
  assert.match(drawer, /className="fixed inset-0 z-40 md:hidden"/);
});

test("la barra inferior respeta el safe-area inferior (notch/gesture bar)", () => {
  assert.match(bottomNav, /env\(safe-area-inset-bottom\)/);
});

test("sidebar y drawer comparten exactamente los mismos destinos de navegación (INSPECTOR_NAV_ITEMS)", () => {
  assert.match(sidebar, /import \{ INSPECTOR_LOGOUT_ITEM, INSPECTOR_NAV_ITEMS \} from "\.\/inspectorNavItems";/);
  assert.match(drawer, /import \{ INSPECTOR_LOGOUT_ITEM, INSPECTOR_NAV_ITEMS \} from "\.\/inspectorNavItems";/);
});
