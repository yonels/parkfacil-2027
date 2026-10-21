import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError, resolveAuthenticatedContext } from "../auth/contextCore.mjs";
import { canAccessPath, hasPermission, PERMISSIONS, ROLES } from "../auth/permissions.mjs";
import { requirePermission, requirePlatformAdmin } from "../auth/apiAuthorizationCore.mjs";
import { getRequestPortal } from "../auth/portal.mjs";

const inspectorUser = { id: "inspector-1", email: "inspector@parkfacil.cl", app_metadata: { role: "inspector" } };

async function rejects403(action, code) {
  await assert.rejects(action, (error) => error instanceof AuthorizationError && error.code === code && error.status === 403);
}

// --- AUTH: usuario no autenticado / sin rol / autorizado (§25 AUTH 1-3) ---

test("usuario no autenticado -> AUTH_REQUIRED 401 (mismo AuthorizationError que el resto de la plataforma)", async () => {
  await assert.rejects(
    () => resolveAuthenticatedContext({ user: null, portal: "inspector", loadMembership: async () => null }),
    (error) => error.code === "AUTH_REQUIRED" && error.status === 401,
  );
});

test("usuario sin rol Inspector (p. ej. company_admin) intentando el portal Inspectores -> 403 PORTAL_FORBIDDEN", async () => {
  const clientAdmin = { id: "admin-1", email: "admin@cliente.cl", app_metadata: {} };
  const membership = { user_id: "admin-1", company_id: "c1", full_name: "Admin", role: "company_admin", status: "active", pos_only: false, company: { id: "c1", status: "active", relationship_type: "client", enabled_products: [] } };
  await rejects403(() => resolveAuthenticatedContext({ user: clientAdmin, portal: "inspector", loadMembership: async () => membership }), "PORTAL_FORBIDDEN");
});

test("operador POS (sin inspector:use) intentando el portal Inspectores -> 403 PORTAL_FORBIDDEN (2026-08-31: login Inspector con identidad propia no debe abrir una puerta trasera para operadores)", async () => {
  const posOperator = { id: "operator-1", email: "operador@cliente.cl", app_metadata: {} };
  const membership = { user_id: "operator-1", company_id: "c1", full_name: "Operador", role: "operator", status: "active", pos_only: true, company: { id: "c1", status: "active", relationship_type: "client", enabled_products: ["ON_STREET"] } };
  await rejects403(() => resolveAuthenticatedContext({ user: posOperator, portal: "inspector", loadMembership: async () => membership }), "PORTAL_FORBIDDEN");
});

test("canAccessPath: un contexto con rol operator (sin inspector:use) nunca puede acceder a /inspector aunque intente forzar portal=inspector", () => {
  const context = { portal: "inspector", role: ROLES.OPERATOR, companyId: "c1" };
  assert.equal(canAccessPath(context, "/inspector"), false);
  assert.equal(hasPermission(ROLES.OPERATOR, PERMISSIONS.INSPECTOR_USE), false);
});

test("Inspector autorizado -> contexto válido, sin company_id, portal inspector", async () => {
  const context = await resolveAuthenticatedContext({ user: inspectorUser, portal: "inspector", loadMembership: async () => { throw new Error("Inspector nunca debe consultar company_members"); } });
  assert.equal(context.role, ROLES.INSPECTOR);
  assert.equal(context.portal, "inspector");
  assert.equal(context.companyId, null, "Inspector no está atado a ninguna empresa (consulta global, §3.1)");
});

test("Inspector solo puede autenticarse en el portal Inspectores, nunca en Root/Cliente/Terminal", async () => {
  for (const portal of ["root", "client", "terminal"]) {
    await rejects403(() => resolveAuthenticatedContext({ user: inspectorUser, portal, loadMembership: async () => null }), "PORTAL_FORBIDDEN");
  }
});

// --- CONSULTA GLOBAL: sin restricción por sector/empresa (§3.1, §25 4-6) ---

test("canAccessPath: Inspector accede a /inspector sin que el contexto lleve companyId ni enabledProducts -- no hay concepto de sector/empresa que filtrar", () => {
  // Deliberadamente SIN companyId ni enabledProducts en el contexto: la regla
  // de acceso de Inspector nunca los evalúa (a diferencia de company_admin/
  // operator, gateados por producto). Esto es la prueba de que "sector A" y
  // "sector B" son indistinguibles para canAccessPath -- no existe ninguna
  // dimensión de scoping que una consulta a otro sector pudiera violar.
  const context = { portal: "inspector", role: ROLES.INSPECTOR };
  assert.equal(canAccessPath(context, "/inspector"), true);
  assert.equal(canAccessPath(context, "/inspector/cualquier-cosa"), true);
});

test("la API server-side de consulta de patentes no recibe ni exige ningún identificador de sector/estacionamiento/empresa", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../app/api/inspector/plates/[plate]/route.js", import.meta.url), "utf8");
  for (const forbidden of ["parkingId", "parking_id", "companyId", "sectorId", "sector_id"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`), `la ruta no debe filtrar/recibir ${forbidden}`);
  }
});

test("findOnStreetSessionByPlate consulta on_street_pilot_sessions sin ningún .eq('parking_id', ...) -- prueba directa de la regla §3.1", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./inspectorRepository.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.eq\("parking_id"/, "la búsqueda global de sesión por patente no debe filtrar por parking_id");
});

// --- RBAC: Inspector nunca alcanza operaciones administrativas (§25 25-28) ---

test("Inspector recibe 403 en cualquier permiso administrativo real del catálogo (no solo uno de ejemplo)", () => {
  const adminOnlyPermissions = [
    PERMISSIONS.COMPANY_MANAGE,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USER_CREDENTIALS_MANAGE,
    PERMISSIONS.PARKINGS_MANAGE,
    PERMISSIONS.SUBSCRIBERS_MANAGE,
    PERMISSIONS.COUPONS_MANAGE,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.BILLING_APPROVE,
    PERMISSIONS.BILLING_ISSUE,
    PERMISSIONS.ON_STREET_QR_MANAGE,
    PERMISSIONS.PLATFORM_GLOBAL,
  ];
  for (const permission of adminOnlyPermissions) {
    assert.equal(hasPermission(ROLES.INSPECTOR, permission), false, permission);
    assert.throws(() => requirePermission({ role: ROLES.INSPECTOR }, permission), (error) => error instanceof AuthorizationError && error.status === 403);
  }
});

test("Inspector intenta modificar tarifa -> 403 (PARKINGS_MANAGE cubre tarifas/estacionamientos)", () => {
  assert.throws(() => requirePermission({ role: ROLES.INSPECTOR }, PERMISSIONS.PARKINGS_MANAGE), (error) => error instanceof AuthorizationError && error.status === 403 && error.code === "PERMISSION_FORBIDDEN");
});

test("Inspector intenta administrar usuarios -> 403", () => {
  assert.throws(() => requirePermission({ role: ROLES.INSPECTOR }, PERMISSIONS.USERS_MANAGE), (error) => error instanceof AuthorizationError && error.status === 403);
});

test("Inspector intenta acciones exclusivas de platform_admin (empresas/contratos/facturación) -> 403", () => {
  assert.throws(() => requirePlatformAdmin({ role: ROLES.INSPECTOR, portal: "inspector" }), (error) => error instanceof AuthorizationError && error.status === 403);
});

test("Inspector nunca alcanza rutas de página administrativas ni las de otros portales", () => {
  const inspectorContext = { portal: "inspector", role: ROLES.INSPECTOR };
  for (const path of ["/empresas", "/usuarios", "/facturacion", "/contratos/1", "/on-street-qr/areas/nueva", "/estacionamientos", "/pos"]) {
    assert.equal(canAccessPath(inspectorContext, path), false, path);
  }
});

test("único permiso de Inspector: inspector:use -- la ausencia de cualquier otro es lo que garantiza el resto", () => {
  assert.equal(hasPermission(ROLES.INSPECTOR, PERMISSIONS.INSPECTOR_USE), true);
  const allOtherPermissions = Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.INSPECTOR_USE);
  for (const permission of allOtherPermissions) assert.equal(hasPermission(ROLES.INSPECTOR, permission), false, permission);
});

// --- Portal detection (ruta y cabecera, mismo criterio que Terminal) ---

test("getRequestPortal reconoce /inspector por ruta y por cabecera explícita, igual que /pos", () => {
  const byPath = { url: "https://onstreet.parkfacilapp.cl/inspector", headers: new Headers() };
  assert.equal(getRequestPortal(byPath), "inspector");
  const byHeader = { url: "https://parkfacilapp.cl/api/inspector/plates/ABC123", headers: new Headers({ "x-parkfacil-portal": "inspector" }) };
  assert.equal(getRequestPortal(byHeader), "inspector");
});

// --- proxy.js: /inspector queda tras el mismo gate real que el resto de la plataforma (§4) ---

test("proxy.js ya no expone /inspector como ruta pública -- pasa por getAuthenticatedContext + canAccessPath como cualquier otra", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../proxy.js", import.meta.url), "utf8");
  const publicPathsBlock = source.slice(source.indexOf("PUBLIC_PATHS = new Set(["), source.indexOf("]);"));
  assert.doesNotMatch(publicPathsBlock, /"\/inspector"/, "/inspector (la app) no debe volver a ser pública");
  assert.match(publicPathsBlock, /"\/inspector\/login"/, "el login real de Inspectores sí debe ser público");
  assert.match(publicPathsBlock, /"\/inspector\/manifest\.webmanifest"/, "el manifest PWA de Inspectores debe seguir siendo público");
  assert.doesNotMatch(source, /pathname\.startsWith\("\/inspector\/"\)\s*\)\s*return NextResponse\.next\(\)/, "no debe quedar ningún bypass amplio de /inspector/*");
});

test("un 401 en /inspector redirige a /inspector/login, no al login genérico", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../proxy.js", import.meta.url), "utf8");
  assert.match(source, /isInspectorPath\(request\.nextUrl\.pathname\) \? "\/inspector\/login"/);
});
