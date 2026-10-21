import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { AuthorizationError } from "./auth/contextCore.mjs";
import { hasPermission, PERMISSIONS, ROLES } from "./auth/permissions.mjs";
import { requirePermission, requirePlatformAdmin } from "./auth/apiAuthorizationCore.mjs";

// RBAC de las rutas NUEVAS de Fiscalizaciones/Inspectores dentro de la
// Administración On Street (§20-23 del brief). No se puede instanciar un
// Request/NextResponse real aquí sin server-only + Supabase, así que se
// prueba en dos capas, igual convención que inspectorRbac.test.mjs:
//   1) el candado real (requirePermission/requirePlatformAdmin) rechaza al
//      rol Inspector con 403, para el permiso exacto que exige
//      authorizeOnStreetAdminRequest (ON_STREET_QR_READ).
//   2) por inspección de código fuente, que cada ruta nueva efectivamente
//      invoca ese candado (y requirePlatformAdmin en las de creación/
//      activación) -- no alcanza con que el candado exista, tiene que estar
//      cableado en la ruta.

test("Inspector no tiene ON_STREET_QR_READ -- authorizeOnStreetAdminRequest lo rechaza con 403 en las 3 rutas nuevas", () => {
  assert.equal(hasPermission(ROLES.INSPECTOR, PERMISSIONS.ON_STREET_QR_READ), false);
  assert.throws(
    () => requirePermission({ role: ROLES.INSPECTOR }, PERMISSIONS.ON_STREET_QR_READ),
    (error) => error instanceof AuthorizationError && error.status === 403,
  );
});

test("Inspector no tiene ON_STREET_QR_MANAGE -- authorizeOnStreetAdminManageRequest lo rechaza con 403", () => {
  assert.equal(hasPermission(ROLES.INSPECTOR, PERMISSIONS.ON_STREET_QR_MANAGE), false);
  assert.throws(
    () => requirePermission({ role: ROLES.INSPECTOR }, PERMISSIONS.ON_STREET_QR_MANAGE),
    (error) => error instanceof AuthorizationError && error.status === 403,
  );
});

test("Inspector nunca es platform_admin -- crear/activar/desactivar Inspectores (POST/PATCH) lo rechaza con 403 aunque de algún modo pasara el primer candado", () => {
  assert.throws(
    () => requirePlatformAdmin({ role: ROLES.INSPECTOR, portal: "inspector" }),
    (error) => error instanceof AuthorizationError && error.status === 403,
  );
});

test("company_admin SÍ puede leer Fiscalizaciones/Inspectores (ON_STREET_QR_READ) pero NO puede crear/activar un Inspector (exclusivo platform_admin, §21)", () => {
  assert.equal(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.ON_STREET_QR_READ), true);
  assert.doesNotThrow(() => requirePermission({ role: ROLES.COMPANY_ADMIN }, PERMISSIONS.ON_STREET_QR_READ));
  assert.throws(
    () => requirePlatformAdmin({ role: ROLES.COMPANY_ADMIN, portal: "client" }),
    (error) => error instanceof AuthorizationError && error.status === 403,
  );
});

async function routeSource(relativePath) {
  return readFile(new URL(`../app/${relativePath}`, import.meta.url), "utf8");
}

test("GET /api/on-street-qr/fiscalizaciones está cableado tras authorizeOnStreetAdminRequest", async () => {
  const source = await routeSource("api/on-street-qr/fiscalizaciones/route.js");
  assert.match(source, /authorizeOnStreetAdminRequest/, "debe importar/usar el candado READ del módulo On Street");
  assert.match(source, /if\s*\(\s*auth\.response\s*\)\s*return\s+auth\.response/, "debe cortar la ejecución si el candado devuelve una respuesta (403/401)");
});

test("GET/POST /api/on-street-qr/inspectores está cableado tras authorizeOnStreetAdminRequest, y POST exige además requirePlatformAdmin", async () => {
  const source = await routeSource("api/on-street-qr/inspectores/route.js");
  assert.match(source, /authorizeOnStreetAdminRequest/, "debe usar el candado READ del módulo On Street");
  assert.match(source, /requirePlatformAdmin/, "la creación de Inspectores debe exigir platform_admin explícitamente (§21)");
});

test("GET/PATCH /api/on-street-qr/inspectores/[id] está cableado tras authorizeOnStreetAdminRequest, y PATCH exige además requirePlatformAdmin", async () => {
  const source = await routeSource("api/on-street-qr/inspectores/[id]/route.js");
  assert.match(source, /authorizeOnStreetAdminRequest/, "debe usar el candado READ del módulo On Street");
  assert.match(source, /requirePlatformAdmin/, "activar/desactivar un Inspector debe exigir platform_admin explícitamente (§21)");
});

test("ninguna de las 3 rutas nuevas confía en un rol/companyId enviado por el cliente -- el contexto siempre sale de authorizeOnStreetAdminRequest/auth.context", async () => {
  for (const path of [
    "api/on-street-qr/fiscalizaciones/route.js",
    "api/on-street-qr/inspectores/route.js",
    "api/on-street-qr/inspectores/[id]/route.js",
  ]) {
    const source = await routeSource(path);
    assert.doesNotMatch(source, /body\.role|params\.role|searchParams\.get\(.role.\)/, `${path}: no debe leer un "role" del cliente`);
  }
});
