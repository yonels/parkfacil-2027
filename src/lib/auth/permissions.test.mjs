import test from "node:test";
import assert from "node:assert/strict";
import { canAccessPath, hasPermission, PERMISSIONS } from "./permissions.mjs";

test("platform_admin conserva acceso global solo desde Root", () => {
  assert.equal(canAccessPath({ portal: "root", role: "platform_admin" }, "/empresas"), true);
  assert.equal(canAccessPath({ portal: "client", role: "platform_admin" }, "/"), false);
});

test("company_admin no entra a módulos exclusivos de Root", () => {
  const context = { portal: "client", role: "company_admin" };
  assert.equal(canAccessPath(context, "/usuarios"), true);
  assert.equal(canAccessPath(context, "/empresas"), false);
  assert.equal(canAccessPath(context, "/contratos/123"), false);
});

test("operator queda fuera de administración de usuarios y empresa", () => {
  const context = { portal: "client", role: "operator" };
  assert.equal(canAccessPath(context, "/operacion"), true);
  assert.equal(canAccessPath(context, "/usuarios"), false);
  assert.equal(hasPermission("operator", PERMISSIONS.USERS_MANAGE), false);
  assert.equal(hasPermission("company_admin", PERMISSIONS.USERS_MANAGE), true);
});
