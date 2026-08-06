import test from "node:test";
import assert from "node:assert/strict";
import { AuthorizationError, resolveAuthenticatedContext } from "./contextCore.mjs";

const clientUser = { id: "user-a", email: "admin@cliente.cl", app_metadata: { role: "company_admin", company_id: "untrusted" } };
const membership = {
  user_id: "user-a", company_id: "company-from-database", full_name: "Admin Cliente", role: "company_admin", status: "active", pos_only: false,
  company: { id: "company-from-database", status: "active", relationship_type: "client", trade_name: "Cliente A" },
};

async function rejectsCode(action, code) {
  await assert.rejects(action, (error) => error instanceof AuthorizationError && error.code === code && error.status === 403);
}

test("la empresa autorizada proviene de company_members y no de metadata", async () => {
  const context = await resolveAuthenticatedContext({ user: clientUser, portal: "client", loadMembership: async () => membership });
  assert.equal(context.companyId, "company-from-database");
  assert.equal(context.role, "company_admin");
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
