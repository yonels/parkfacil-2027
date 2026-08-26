import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPath, hasEnabledProduct, hasPermission, navigationVisibleForRole, PERMISSIONS, PRODUCTS, resolveEnabledProducts, ROLES } from "./permissions.mjs";

test("platform_admin conserva acceso global solo desde Root", () => {
  assert.equal(canAccessPath({ portal: "root", role: "platform_admin" }, "/empresas"), true);
  assert.equal(canAccessPath({ portal: "client", role: "platform_admin" }, "/"), false);
});

test("company_admin no entra a módulos exclusivos de Root", () => {
  const context = { portal: "client", role: "company_admin", enabledProducts: ["OFF_STREET", "ON_STREET"] };
  assert.equal(canAccessPath(context, "/usuarios"), true);
  assert.equal(canAccessPath(context, "/empresas"), false);
  assert.equal(canAccessPath(context, "/contratos/123"), false);
  assert.equal(canAccessPath(context, "/facturacion"), false);
});

test("Facturación queda temporalmente disponible solo para platform_admin desde Root", () => {
  assert.equal(canAccessPath({ portal: "root", role: "platform_admin" }, "/facturacion"), true);
  assert.equal(canAccessPath({ portal: "client", role: "company_admin" }, "/facturacion"), false);
  assert.equal(canAccessPath({ portal: "client", role: "operator" }, "/facturacion"), false);
});

test("operator queda fuera de administración de usuarios y empresa", () => {
  const context = { portal: "client", role: "operator", enabledProducts: ["OFF_STREET"] };
  assert.equal(canAccessPath(context, "/operacion"), true);
  assert.equal(canAccessPath(context, "/usuarios"), false);
  assert.equal(hasPermission("operator", PERMISSIONS.USERS_MANAGE), false);
  assert.equal(hasPermission("company_admin", PERMISSIONS.USERS_MANAGE), true);
  assert.equal(hasPermission("company_admin", PERMISSIONS.USER_CREDENTIALS_MANAGE), true);
  assert.equal(hasPermission("operator", PERMISSIONS.USER_CREDENTIALS_MANAGE), false);
});

test("accesos directos de creación On Street (área/calle/tramo) son exclusivos de Root", () => {
  assert.equal(canAccessPath({ portal: "root", role: "platform_admin" }, "/on-street-qr/areas/nueva"), true);
  assert.equal(canAccessPath({ portal: "root", role: "platform_admin" }, "/on-street-qr/calles/nueva"), true);
  assert.equal(canAccessPath({ portal: "root", role: "platform_admin" }, "/on-street-qr/tramos/nuevo"), true);

  const admin = { portal: "client", role: "company_admin", enabledProducts: ["OFF_STREET", "ON_STREET"] };
  assert.equal(canAccessPath(admin, "/on-street-qr/areas/nueva"), false);
  assert.equal(canAccessPath(admin, "/on-street-qr/calles/nueva"), false);
  assert.equal(canAccessPath(admin, "/on-street-qr/tramos/nuevo"), false);

  const operator = { portal: "client", role: "operator", enabledProducts: ["ON_STREET"] };
  assert.equal(canAccessPath(operator, "/on-street-qr/areas/nueva"), false);

  // El resto de /on-street-qr (fuera de crear área/calle/tramo) sigue
  // disponible para company_admin, sin cambios -- siempre que el producto
  // On Street esté habilitado (ver bloque de acceso por producto abajo).
  assert.equal(canAccessPath(admin, "/on-street-qr/ubicaciones"), true);
  assert.equal(canAccessPath(admin, "/on-street-qr/sesiones"), true);
});

test("Terminal permite solo /pos a roles con operations:use", () => {
  const operator = { portal: "terminal", role: "operator" };
  assert.equal(canAccessPath(operator, "/pos"), true);
  for (const path of ["/", "/empresas", "/usuarios", "/facturacion", "/operacion", "/dispositivos"]) {
    assert.equal(canAccessPath(operator, path), false, `${path} debe quedar fuera del Terminal`);
  }
  assert.equal(canAccessPath({ portal: "terminal", role: "viewer" }, "/pos"), false);
  assert.equal(canAccessPath({ portal: "terminal", role: "platform_admin" }, "/pos"), true);
});

// --- Acceso diferenciado por producto (Off Street / On Street) ---
// Ver companies.enabled_products (migración 20260822090000) y §5-§9/§27-§28
// de la auditoría "ACCESO DIFERENCIADO OFF-STREET / ON-STREET".

test("resolveEnabledProducts: platform_admin siempre tiene ambos productos, ignore lo que traiga la empresa", () => {
  assert.deepEqual(resolveEnabledProducts(ROLES.PLATFORM_ADMIN, null), ["OFF_STREET", "ON_STREET"]);
  assert.deepEqual(resolveEnabledProducts(ROLES.PLATFORM_ADMIN, { enabled_products: [] }), ["OFF_STREET", "ON_STREET"]);
});

test("resolveEnabledProducts: company_admin/operator quedan limitados a companies.enabled_products, saneado", () => {
  assert.deepEqual(resolveEnabledProducts(ROLES.COMPANY_ADMIN, { enabled_products: ["OFF_STREET"] }), ["OFF_STREET"]);
  assert.deepEqual(resolveEnabledProducts(ROLES.COMPANY_ADMIN, { enabled_products: ["ON_STREET"] }), ["ON_STREET"]);
  assert.deepEqual(resolveEnabledProducts(ROLES.OPERATOR, { enabled_products: ["OFF_STREET", "ON_STREET"] }), ["OFF_STREET", "ON_STREET"]);
  // Nunca se confía en valores arbitrarios que pudieran llegar en la columna.
  assert.deepEqual(resolveEnabledProducts(ROLES.COMPANY_ADMIN, { enabled_products: ["OFF_STREET", "OTRO_PRODUCTO"] }), ["OFF_STREET"]);
  // Sin empresa/columna -> ningún producto (fail closed, nunca ambos por defecto).
  assert.deepEqual(resolveEnabledProducts(ROLES.COMPANY_ADMIN, null), []);
  assert.deepEqual(resolveEnabledProducts(ROLES.COMPANY_ADMIN, { enabled_products: [] }), []);
});

test("hasEnabledProduct", () => {
  assert.equal(hasEnabledProduct(["OFF_STREET"], PRODUCTS.OFF_STREET), true);
  assert.equal(hasEnabledProduct(["OFF_STREET"], PRODUCTS.ON_STREET), false);
  assert.equal(hasEnabledProduct(undefined, PRODUCTS.OFF_STREET), false);
  assert.equal(hasEnabledProduct([], PRODUCTS.OFF_STREET), false);
});

test("Empresa solo Off Street: no puede acceder a On Street ni con la ruta exacta", () => {
  const offStreetOnly = { portal: "client", role: "company_admin", enabledProducts: ["OFF_STREET"] };
  assert.equal(canAccessPath(offStreetOnly, "/estacionamientos"), true);
  assert.equal(canAccessPath(offStreetOnly, "/estacionamientos?tipo=OFF_STREET".split("?")[0]), true);
  assert.equal(canAccessPath(offStreetOnly, "/on-street-qr"), false);
  assert.equal(canAccessPath(offStreetOnly, "/on-street-qr/reportes"), false);
  assert.equal(canAccessPath(offStreetOnly, "/on-street-qr/ubicaciones"), false);
});

test("Empresa solo On Street: no puede acceder a Off Street ni con la ruta exacta", () => {
  const onStreetOnly = { portal: "client", role: "company_admin", enabledProducts: ["ON_STREET"] };
  assert.equal(canAccessPath(onStreetOnly, "/on-street-qr"), true);
  assert.equal(canAccessPath(onStreetOnly, "/on-street-qr/reportes"), true);
  assert.equal(canAccessPath(onStreetOnly, "/estacionamientos"), false);
  assert.equal(canAccessPath(onStreetOnly, "/estacionamientos/parking-123"), false);
});

test("Empresa con ambos productos accede a los dos; empresa sin ninguno queda fuera de ambos", () => {
  const both = { portal: "client", role: "company_admin", enabledProducts: ["OFF_STREET", "ON_STREET"] };
  assert.equal(canAccessPath(both, "/estacionamientos"), true);
  assert.equal(canAccessPath(both, "/on-street-qr"), true);

  const none = { portal: "client", role: "company_admin", enabledProducts: [] };
  assert.equal(canAccessPath(none, "/estacionamientos"), false);
  assert.equal(canAccessPath(none, "/on-street-qr"), false);
  // El resto de la plataforma (no ligado a un producto) sigue disponible.
  assert.equal(canAccessPath(none, "/usuarios"), true);
});

// Regresión: "Off Street" en navigation.js usa un href con query string
// ("/estacionamientos?tipo=OFF_STREET"). navigationVisibleForRole debe
// quitarla antes de evaluar canAccessPath -- de lo contrario el ítem queda
// visible para una empresa exclusivamente On Street, aunque /estacionamientos
// esté correctamente bloqueado a nivel de página/API (bug detectado en la
// validación QA de acceso por producto).
test("navigationVisibleForRole: quita la query string del href antes de evaluar el producto requerido", () => {
  const offStreetItem = { href: "/estacionamientos?tipo=OFF_STREET", label: "Off Street" };
  const onStreetOnly = { portal: "client", role: "company_admin", enabledProducts: ["ON_STREET"] };
  assert.equal(navigationVisibleForRole(offStreetItem, onStreetOnly), false);

  const offStreetOnly = { portal: "client", role: "company_admin", enabledProducts: ["OFF_STREET"] };
  assert.equal(navigationVisibleForRole(offStreetItem, offStreetOnly), true);
});

test("Root nunca queda sujeto a la restricción por producto", () => {
  const root = { portal: "root", role: "platform_admin" };
  assert.equal(canAccessPath(root, "/estacionamientos"), true);
  assert.equal(canAccessPath(root, "/on-street-qr"), true);
});
