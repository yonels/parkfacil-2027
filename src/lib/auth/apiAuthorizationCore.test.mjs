import test from "node:test";
import assert from "node:assert/strict";
import { companyScope, requireCompanyResource, requirePermission, requirePlatformAdmin, requireProduct } from "./apiAuthorizationCore.mjs";
import { PERMISSIONS, PRODUCTS } from "./permissions.mjs";

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

test("requireProduct: Root queda exento siempre, aunque no declare enabledProducts", () => {
  assert.equal(requireProduct(root, PRODUCTS.OFF_STREET), root);
  assert.equal(requireProduct(root, PRODUCTS.ON_STREET), root);
});

test("requireProduct: empresa sin el producto habilitado recibe 403 PRODUCT_NOT_ENABLED, aunque manipule la API directamente", () => {
  const offStreetOnly = { ...adminA, enabledProducts: [PRODUCTS.OFF_STREET] };
  assert.equal(requireProduct(offStreetOnly, PRODUCTS.OFF_STREET), offStreetOnly);
  assert.throws(() => requireProduct(offStreetOnly, PRODUCTS.ON_STREET), (error) => error.status === 403 && error.code === "PRODUCT_NOT_ENABLED");

  const onStreetOnlyOperator = { ...operatorA, enabledProducts: [PRODUCTS.ON_STREET] };
  assert.equal(requireProduct(onStreetOnlyOperator, PRODUCTS.ON_STREET), onStreetOnlyOperator);
  assert.throws(() => requireProduct(onStreetOnlyOperator, PRODUCTS.OFF_STREET), (error) => error.status === 403 && error.code === "PRODUCT_NOT_ENABLED");

  const noProducts = { ...adminA, enabledProducts: [] };
  assert.throws(() => requireProduct(noProducts, PRODUCTS.OFF_STREET), (error) => error.status === 403);
  assert.throws(() => requireProduct(noProducts, PRODUCTS.ON_STREET), (error) => error.status === 403);
});
