import test from "node:test";
import assert from "node:assert/strict";
import { companyScope, requireCompanyResource, requirePermission, requirePlatformAdmin } from "./apiAuthorizationCore.mjs";
import { PERMISSIONS } from "./permissions.mjs";

const root = { userId: "root", companyId: null, portal: "root", role: "platform_admin" };
const adminA = { userId: "admin-a", companyId: "company-a", portal: "client", role: "company_admin" };
const operatorA = { userId: "operator-a", companyId: "company-a", portal: "client", role: "operator" };

test("Root conserva alcance global y no recibe filtro de empresa", () => {
  assert.equal(companyScope(root), null);
  assert.equal(requireCompanyResource(root, "company-b"), root);
  assert.equal(requirePlatformAdmin(root), root);
});

test("company_admin queda acotado a company_members aunque se manipule el ID", () => {
  assert.equal(companyScope(adminA), "company-a");
  assert.equal(requireCompanyResource(adminA, "company-a"), adminA);
  assert.throws(() => requireCompanyResource(adminA, "company-b"), (error) => error.status === 404 && error.code === "RESOURCE_NOT_FOUND");
});

test("operator recibe 403 para administración de usuarios", () => {
  assert.throws(() => requirePermission(operatorA, PERMISSIONS.USERS_MANAGE), (error) => error.status === 403 && error.code === "PERMISSION_FORBIDDEN");
});

test("una cuenta Cliente no puede ejecutar acciones exclusivas de Root", () => {
  assert.throws(() => requirePlatformAdmin(adminA), (error) => error.status === 403 && error.code === "PLATFORM_ADMIN_REQUIRED");
});
