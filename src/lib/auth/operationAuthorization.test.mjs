import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { hasPermission, PERMISSIONS, ROLES } from "./permissions.mjs";

// operationAuthorization.js importa "server-only" (paquete stub que solo
// resuelve dentro del bundler de Next.js) -- por eso, igual que el resto de
// la suite, no se importa directamente en node --test (confirmado: intentarlo
// falla con ERR_MODULE_NOT_FOUND: "Cannot find package 'server-only'").
// Es el mismo motivo por el que ningún test existente en el repo importa un
// archivo "server-only" directamente; el patrón establecido (ver
// offStreetOperationsService.test.mjs / posStaysService.test.mjs) es leer el
// código fuente con readFile() para verificar el patrón exacto desplegado, y
// probar la lógica pura que decide el resultado (aquí, hasPermission) con la
// función real de producción. authorizeOperationRequest también depende de
// getAuthenticatedContext -> db.auth.getUser(token) (Supabase real) en
// cuanto hay un token, así que un test de integración de extremo a extremo
// (con sesión válida) requeriría mock.module (necesita
// --experimental-test-module-mocks, no habilitado en el script "test") o un
// refactor de la firma -- ninguno de los dos autorizado para esta
// validación ("No hagas refactor adicional").

// La resolución de permisos con sesión válida (A/B/C/D con usuario
// autenticado) depende de db.auth.getUser(token) contra Supabase real, así
// que se prueba aquí a nivel del predicado exacto que authorizeOperationRequest
// evalúa -- hasPermission/ROLES/PERMISSIONS son el mismo código de producción
// que usa la función (ver el import real de operationAuthorization.js más
// abajo), no una reimplementación, así que esta tabla de verdad es
// exactamente la que decide la rama Array.isArray(permission) en runtime.
// El resto de la cadena (scope/company/PORTAL_FORBIDDEN) no se toca en esta
// tarea (ver assertion de "sin diff" al final) y ya está cubierta por
// parkingAuthorizationCore.test.mjs/contextCore.test.mjs/portal.test.mjs.
test("TABLA DE VERDAD (permisos reales): platform_admin y company_admin pasan REPORTS_READ, OPERATIONS_USE y el arreglo combinado (A, B, C)", () => {
  for (const role of [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN]) {
    assert.equal(hasPermission(role, PERMISSIONS.REPORTS_READ), true, `${role} debe tener REPORTS_READ`);
    assert.equal(hasPermission(role, PERMISSIONS.OPERATIONS_USE), true, `${role} debe tener OPERATIONS_USE`);
    const permissions = [PERMISSIONS.REPORTS_READ, PERMISSIONS.OPERATIONS_USE];
    assert.equal(permissions.some((permission) => hasPermission(role, permission)), true, `${role} debe pasar el arreglo combinado`);
  }
});

test("TABLA DE VERDAD (permisos reales): operator NO tiene REPORTS_READ (string histórico sigue rechazando -- A intacto) pero SÍ tiene OPERATIONS_USE (string histórico sigue aceptando -- B intacto), y el arreglo lo acepta por OPERATIONS_USE (C, capacidad nueva de /operacion)", () => {
  assert.equal(hasPermission(ROLES.OPERATOR, PERMISSIONS.REPORTS_READ), false);
  assert.equal(hasPermission(ROLES.OPERATOR, PERMISSIONS.OPERATIONS_USE), true);
  const permissions = [PERMISSIONS.REPORTS_READ, PERMISSIONS.OPERATIONS_USE];
  assert.equal(permissions.some((permission) => hasPermission(ROLES.OPERATOR, permission)), true);
});

test("TABLA DE VERDAD (permisos reales): un rol sin ninguno de los dos permisos (inspector) es rechazado tanto por cada string como por el arreglo -- caso D", () => {
  assert.equal(hasPermission(ROLES.INSPECTOR, PERMISSIONS.REPORTS_READ), false);
  assert.equal(hasPermission(ROLES.INSPECTOR, PERMISSIONS.OPERATIONS_USE), false);
  const permissions = [PERMISSIONS.REPORTS_READ, PERMISSIONS.OPERATIONS_USE];
  assert.equal(permissions.some((permission) => hasPermission(ROLES.INSPECTOR, permission)), false);
});

test("la rama string sigue usando literalmente requirePermission (mismo camino de código y mismo AuthorizationError que antes de este cambio)", async () => {
  const source = await readFile(new URL("./operationAuthorization.js", import.meta.url), "utf8");
  assert.match(source, /if \(Array\.isArray\(permission\)\) \{/);
  assert.match(source, /permission\.some\(\(item\) => hasPermission\(authorization\.context\?\.role, item\)\)/);
  assert.match(source, /\} else \{\s*requirePermission\(authorization\.context, permission\);\s*\}/);
  // La rama nueva lanza el mismo AuthorizationError (mismo code/status/mensaje
  // que requirePermission -- ver apiAuthorizationCore.mjs) para no introducir
  // un contrato de error distinto según se llame con string o con arreglo.
  assert.match(source, /new AuthorizationError\("PERMISSION_FORBIDDEN", 403, "No tienes permiso para realizar esta acción\.", authorization\.context\)/);
});

// E: el resto de la cadena de autorización (resolución de scope por
// empresa/estacionamiento, PORTAL_FORBIDDEN, platform_admin/company_admin/
// operator) no fue tocada por esta tarea -- prueba dura: diff vacío contra
// HEAD en cada archivo del que depende authorizeOperationRequest.
test("E: los archivos de los que depende el scope (parkingQueryScope/contextCore/parkingAuthorization/permissions) no fueron modificados por esta tarea", async () => {
  const { execFileSync } = await import("node:child_process");
  const files = [
    "src/lib/auth/parkingAuthorizationCore.mjs",
    "src/lib/auth/contextCore.mjs",
    "src/lib/auth/parkingAuthorization.js",
    "src/lib/auth/permissions.mjs",
    "src/lib/auth/authenticatedContext.js",
    "src/lib/auth/apiAuthorization.js",
    "src/lib/auth/apiAuthorizationCore.mjs",
  ];
  const diff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...files], { cwd: new URL("../../..", import.meta.url), encoding: "utf8" });
  assert.equal(diff.trim(), "", `Estos archivos de resolución de scope deberían seguir sin diff contra HEAD:\n${diff}`);
});
