import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError, resolveAuthenticatedContext } from "./contextCore.mjs";

// email_confirmed_at presente en todos los mocks de usuario de este archivo
// (§ "usuario deshabilitado" -- resolveAuthenticatedContext ahora exige
// usuarioAuthHabilitado(user) antes de todo lo demás, ver el test dedicado
// más abajo): estos mocks representan una cuenta real, habilitada, tal
// como la devuelve db.auth.getUser en producción.
const clientUser = { id: "user-a", email: "admin@cliente.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { role: "company_admin", company_id: "untrusted" } };
const membership = {
  user_id: "user-a", company_id: "company-from-database", full_name: "Admin Cliente", role: "company_admin", status: "active", pos_only: false,
  company: { id: "company-from-database", status: "active", relationship_type: "client", trade_name: "Cliente A", enabled_products: ["OFF_STREET", "ON_STREET"] },
};

async function rejectsCode(action, code) {
  await assert.rejects(action, (error) => error instanceof AuthorizationError && error.code === code && error.status === 403);
}

async function rejectsCode2(action, code, status) {
  await assert.rejects(action, (error) => error instanceof AuthorizationError && error.code === code && error.status === status);
}

test("la empresa autorizada proviene de company_members y no de metadata", async () => {
  const context = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => membership });
  assert.equal(context.companyId, "company-from-database");
  assert.equal(context.role, "company_admin");
});

test("enabledProducts: platform_admin siempre ambos; company_admin/operator quedan limitados a companies.enabled_products", async () => {
  const rootUser = { id: "root-user", email: "root@parkfacil.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { role: "platform_admin" } };
  const rootContext = await resolveAuthenticatedContext({ user: rootUser, portal: "root", loadMembership: async () => { throw new Error("no debe consultar membresía"); } });
  assert.deepEqual(rootContext.enabledProducts, ["OFF_STREET", "ON_STREET"]);

  const mixedContext = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => membership });
  assert.deepEqual(mixedContext.enabledProducts, ["OFF_STREET", "ON_STREET"]);

  const onStreetOnlyMembership = { ...membership, company: { ...membership.company, enabled_products: ["ON_STREET"] } };
  const onStreetOnlyContext = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => onStreetOnlyMembership });
  assert.deepEqual(onStreetOnlyContext.enabledProducts, ["ON_STREET"]);

  // Empresa sin ningún producto asignado (columna vacía o ausente): la
  // sesión sigue siendo válida (no es un caso de MEMBERSHIP_INACTIVE), pero
  // enabledProducts queda vacío -- el bloqueo ocurre en canAccessPath, no
  // aquí.
  const noProductsMembership = { ...membership, company: { ...membership.company, enabled_products: [] } };
  const noProductsContext = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => noProductsMembership });
  assert.deepEqual(noProductsContext.enabledProducts, []);
});

test("bloquea membresía inactiva o inexistente", async () => {
  await rejectsCode(() => resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => null }), "MEMBERSHIP_INACTIVE");
  await rejectsCode(() => resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => ({ ...membership, status: "suspended" }) }), "MEMBERSHIP_INACTIVE");
});

test("bloquea empresa inactiva o que no sea cliente", async () => {
  await rejectsCode(() => resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => ({ ...membership, company: { ...membership.company, status: "inactive" } }) }), "COMPANY_INACTIVE");
  await rejectsCode(() => resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => ({ ...membership, company: { ...membership.company, relationship_type: "operator" } }) }), "COMPANY_INACTIVE");
});

test("separa estrictamente los roles entre portales", async () => {
  await rejectsCode(() => resolveAuthenticatedContext({ user: clientUser, portal: "root", loadMembership: async () => membership }), "PORTAL_FORBIDDEN");
  const rootUser = { id: "root-user", email: "root@parkfacil.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { role: "platform_admin" } };
  const rootContext = await resolveAuthenticatedContext({ user: rootUser, portal: "root", loadMembership: async () => { throw new Error("no debe consultar membresía"); } });
  assert.equal(rootContext.companyId, null);
  await rejectsCode(() => resolveAuthenticatedContext({ user: rootUser, portal: "client", loadMembership: async () => null }), "PORTAL_FORBIDDEN");
});

// ============================================================
// Usuario deshabilitado (banned_until/deleted_at/sin confirmar) --
// vulnerabilidad real encontrada y corregida en esta auditoría: un token
// ya emitido ANTES de deshabilitar a alguien seguía siendo aceptado hasta
// su propio vencimiento (~55 min), porque el chequeo de "cuenta habilitada"
// no existía en resolveAuthenticatedContext. Confirmado en vivo contra un
// Supabase real: login rechazado tras banear (esperado, ya lo hacía
// Supabase), pero la app seguía aceptando el token pre-ban -- eso es lo
// que corrige este bloque.
// ============================================================

test("usuario con banned_until en el futuro es rechazado, aunque el token siga siendo criptográficamente válido", async () => {
  const baneado = { ...clientUser, banned_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  await rejectsCode2(() => resolveAuthenticatedContext({ user: baneado, portal: "client", loadMembership: async () => membership }), "AUTH_REQUIRED", 401);
});

test("usuario con banned_until en el pasado (ban ya vencido) sí puede continuar -- coherente con la semántica de Supabase", async () => {
  const banVencido = { ...clientUser, banned_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
  const context = await resolveAuthenticatedContext({ user: banVencido, portal: "client", loadMembership: async () => membership });
  assert.equal(context.role, "company_admin");
});

test("usuario con deleted_at es rechazado", async () => {
  const eliminado = { ...clientUser, deleted_at: "2026-01-01T00:00:00Z" };
  await rejectsCode2(() => resolveAuthenticatedContext({ user: eliminado, portal: "client", loadMembership: async () => membership }), "AUTH_REQUIRED", 401);
});

test("usuario sin email_confirmed_at es rechazado", async () => {
  const sinConfirmar = { ...clientUser, email_confirmed_at: null };
  await rejectsCode2(() => resolveAuthenticatedContext({ user: sinConfirmar, portal: "client", loadMembership: async () => membership }), "AUTH_REQUIRED", 401);
});

test("Root también queda sujeto al chequeo de cuenta habilitada -- ningún rol es excepción", async () => {
  const rootBaneado = { ...rootUser, banned_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  await rejectsCode2(() => resolveAuthenticatedContext({ user: rootBaneado, portal: "root", loadMembership: async () => { throw new Error("no debe llegar aquí"); } }), "AUTH_REQUIRED", 401);
});

test("requiere un usuario autenticado", async () => {
  await assert.rejects(
    () => resolveAuthenticatedContext({ user: null, portal: "client", loadMembership: async () => null }),
    (error) => error.code === "AUTH_REQUIRED" && error.status === 401,
  );
});

test("operator activo puede autenticarse en Terminal y Root sigue separado", async () => {
  const operatorUser = { id: "operator-a", email: "operator@cliente.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {} };
  const operatorMembership = { ...membership, user_id: "operator-a", role: "operator", pos_only: true };
  const terminal = await resolveAuthenticatedContext({ user: operatorUser, portal: "terminal", loadMembership: async () => operatorMembership });
  assert.equal(terminal.portal, "terminal");
  assert.equal(terminal.role, "operator");
  await rejectsCode(() => resolveAuthenticatedContext({ user: operatorUser, portal: "root", loadMembership: async () => operatorMembership }), "PORTAL_FORBIDDEN");
});

test("platform_admin permanece exclusivo de Root", async () => {
  const rootUser = { id: "root-user", email: "root@parkfacil.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { role: "platform_admin" } };
  await rejectsCode(() => resolveAuthenticatedContext({ user: rootUser, portal: "terminal", loadMembership: async () => null }), "PORTAL_FORBIDDEN");
});

// ============================================================
// Modelo de activación de usuarios por empresa (product_scope,
// access_expires_at) -- integración con resolveAuthenticatedContext.
// ============================================================

test("product_scope restringe enabledProducts por usuario, más allá de lo que la empresa tiene habilitado", async () => {
  const operatorUser = { id: "operator-off", email: "operador@cliente.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {} };
  const scopedMembership = { ...membership, user_id: "operator-off", role: "operator", product_scope: "OFF_STREET" };
  const context = await resolveAuthenticatedContext({ user: operatorUser, portal: "client", loadMembership: async () => scopedMembership });
  assert.deepEqual(context.enabledProducts, ["OFF_STREET"]);
  assert.equal(context.membership.productScope, "OFF_STREET");
});

test("product_scope NULL (registro histórico) no restringe nada -- mismo comportamiento previo a la migración", async () => {
  const context = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => ({ ...membership, product_scope: null }) });
  assert.deepEqual(context.enabledProducts, ["OFF_STREET", "ON_STREET"]);
});

test("access_expires_at en el pasado bloquea la sesión con ACCESS_EXPIRED, aunque status siga 'active'", async () => {
  const vencida = { ...membership, access_expires_at: "2020-01-01T00:00:00Z" };
  await rejectsCode(() => resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => vencida }), "ACCESS_EXPIRED");
});

test("access_expires_at en el futuro permite la sesión con normalidad", async () => {
  const futura = { ...membership, access_expires_at: "2999-01-01T00:00:00Z" };
  const context = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => futura });
  assert.equal(context.membership.accessExpiresAt, "2999-01-01T00:00:00Z");
});

test("access_expires_at NULL (indefinido) nunca bloquea", async () => {
  const context = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => ({ ...membership, access_expires_at: null }) });
  assert.equal(context.membership.accessExpiresAt, null);
});

// ============================================================
// Impersonación Root -> Cliente
// ============================================================

const rootUser = { id: "root-user", email: "root@parkfacil.cl", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: { role: "platform_admin" } };
const empresaOnboarding = { id: "emp-piloto", status: "onboarding", relationship_type: "client", enabled_products: ["OFF_STREET", "ON_STREET"] };

test("Caso 21 (integración): Root puede impersonar una empresa en estado onboarding", async () => {
  const context = await resolveAuthenticatedContext({
    user: rootUser, portal: "client", impersonatedCompanyId: "emp-piloto",
    loadMembership: async () => { throw new Error("no debe consultar membership -- Root no tiene fila company_members"); },
    loadCompany: async (id) => (id === "emp-piloto" ? empresaOnboarding : null),
  });
  assert.equal(context.companyId, "emp-piloto");
  assert.equal(context.impersonating, true);
  assert.deepEqual(context.enabledProducts, ["OFF_STREET", "ON_STREET"]);
});

test("Caso 22 (integración): el contexto impersonado nunca se filtra a otra empresa distinta de la elegida", async () => {
  const context = await resolveAuthenticatedContext({
    user: rootUser, portal: "client", impersonatedCompanyId: "emp-piloto",
    loadMembership: async () => null,
    loadCompany: async () => empresaOnboarding,
  });
  assert.equal(context.companyId, "emp-piloto");
  assert.notEqual(context.companyId, "otra-empresa");
});

test("Caso 23 (integración): activated_by/suspended_by (context.userId) registran al Root real durante la impersonación", async () => {
  const context = await resolveAuthenticatedContext({
    user: rootUser, portal: "client", impersonatedCompanyId: "emp-piloto",
    loadMembership: async () => null,
    loadCompany: async () => empresaOnboarding,
  });
  assert.equal(context.userId, "root-user");
  assert.equal(context.realUserId, "root-user");
});

test("Caso 24: sin cookie de impersonación (tras 'Salir'), Root vuelve a resolver su contexto normal de Root", async () => {
  const context = await resolveAuthenticatedContext({
    user: rootUser, portal: "root", impersonatedCompanyId: null,
    loadMembership: async () => { throw new Error("no debe consultar membership"); },
  });
  assert.equal(context.role, "platform_admin");
  assert.equal(context.impersonating, false);
  assert.equal(context.companyId, null);
});

test("Caso 25: un company_admin/operator real NUNCA puede fabricar un contexto de impersonación, sin importar qué impersonatedCompanyId envíe", async () => {
  // clientUser tiene app_metadata.role="company_admin" (no platform_admin)
  // -- la rama de impersonación vive DENTRO del bloque
  // metadataRole===PLATFORM_ADMIN, así que un usuario real no-Root jamás
  // la alcanza, aunque el caller (por error o ataque) pase
  // impersonatedCompanyId. Se resuelve como una sesión cliente normal,
  // ignorando por completo ese parámetro.
  const context = await resolveAuthenticatedContext({
    user: clientUser, portal: "client", impersonatedCompanyId: "emp-otra-empresa-cualquiera",
    loadMembership: async () => membership,
    loadCompany: async () => { throw new Error("loadCompany NUNCA debe invocarse para un usuario no-platform_admin"); },
  });
  assert.equal(context.companyId, "company-from-database"); // la real, de su propia membresía -- no "emp-otra-empresa-cualquiera"
  assert.equal(context.impersonating, undefined);
});

test("empresas relationship_type distinto de client no son impersonables (COMPANY_NOT_IMPERSONABLE)", async () => {
  await rejectsCode(() => resolveAuthenticatedContext({
    user: rootUser, portal: "client", impersonatedCompanyId: "emp-op",
    loadMembership: async () => null,
    loadCompany: async () => ({ id: "emp-op", status: "active", relationship_type: "operator" }),
  }), "COMPANY_NOT_IMPERSONABLE");
});

test("impersonar desde otro portal (p.ej. root) es rechazado -- la impersonación solo aplica al Portal Cliente", async () => {
  await rejectsCode(() => resolveAuthenticatedContext({
    user: rootUser, portal: "root", impersonatedCompanyId: "emp-piloto",
    loadMembership: async () => null,
    loadCompany: async () => empresaOnboarding,
  }), "PORTAL_FORBIDDEN");
});
