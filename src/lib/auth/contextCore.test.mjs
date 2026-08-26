import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError, resolveAuthenticatedContext } from "./contextCore.mjs";

const clientUser = { id: "user-a", email: "admin@cliente.cl", app_metadata: { role: "company_admin", company_id: "untrusted" } };
const membership = {
  user_id: "user-a", company_id: "company-from-database", full_name: "Admin Cliente", role: "company_admin", status: "active", pos_only: false,
  company: { id: "company-from-database", status: "active", relationship_type: "client", trade_name: "Cliente A", enabled_products: ["OFF_STREET", "ON_STREET"] },
};

async function rejectsCode(action, code) {
  await assert.rejects(action, (error) => error instanceof AuthorizationError && error.code === code && error.status === 403);
}

test("la empresa autorizada proviene de company_members y no de metadata", async () => {
  const context = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => membership });
  assert.equal(context.companyId, "company-from-database");
  assert.equal(context.role, "company_admin");
});

test("enabledProducts: platform_admin siempre ambos; company_admin/operator quedan limitados a companies.enabled_products", async () => {
  const rootUser = { id: "root-user", email: "root@parkfacil.cl", app_metadata: { role: "platform_admin" } };
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
  const rootUser = { id: "root-user", email: "root@parkfacil.cl", app_metadata: { role: "platform_admin" } };
  const rootContext = await resolveAuthenticatedContext({ user: rootUser, portal: "root", loadMembership: async () => { throw new Error("no debe consultar membresía"); } });
  assert.equal(rootContext.companyId, null);
  await rejectsCode(() => resolveAuthenticatedContext({ user: rootUser, portal: "client", loadMembership: async () => null }), "PORTAL_FORBIDDEN");
});

test("requiere un usuario autenticado", async () => {
  await assert.rejects(
    () => resolveAuthenticatedContext({ user: null, portal: "client", loadMembership: async () => null }),
    (error) => error.code === "AUTH_REQUIRED" && error.status === 401,
  );
});

test("operator activo puede autenticarse en Terminal y Root sigue separado", async () => {
  const operatorUser = { id: "operator-a", email: "operator@cliente.cl", app_metadata: {} };
  const operatorMembership = { ...membership, user_id: "operator-a", role: "operator", pos_only: true };
  const terminal = await resolveAuthenticatedContext({ user: operatorUser, portal: "terminal", loadMembership: async () => operatorMembership });
  assert.equal(terminal.portal, "terminal");
  assert.equal(terminal.role, "operator");
  await rejectsCode(() => resolveAuthenticatedContext({ user: operatorUser, portal: "root", loadMembership: async () => operatorMembership }), "PORTAL_FORBIDDEN");
});

test("platform_admin permanece exclusivo de Root", async () => {
  const rootUser = { id: "root-user", email: "root@parkfacil.cl", app_metadata: { role: "platform_admin" } };
  await rejectsCode(() => resolveAuthenticatedContext({ user: rootUser, portal: "terminal", loadMembership: async () => null }), "PORTAL_FORBIDDEN");
});
