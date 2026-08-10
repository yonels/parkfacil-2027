import test from "node:test";
import assert from "node:assert/strict";
import { hasPermission, PERMISSIONS, ROLES } from "../auth/permissions.mjs";

test("Facturacion financiera queda limitada a platform_admin",()=>{
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.BILLING_READ),true);
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.BILLING_MANAGE),true);
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.BILLING_APPROVE),true);
  assert.equal(hasPermission(ROLES.PLATFORM_ADMIN,PERMISSIONS.BILLING_ISSUE),true);
  assert.equal(hasPermission(ROLES.COMPANY_ADMIN,PERMISSIONS.BILLING_READ),false);
  assert.equal(hasPermission(ROLES.COMPANY_ADMIN,PERMISSIONS.BILLING_APPROVE),false);
  assert.equal(hasPermission(ROLES.COMPANY_ADMIN,PERMISSIONS.BILLING_ISSUE),false);
  assert.equal(hasPermission(ROLES.OPERATOR,PERMISSIONS.BILLING_MANAGE),false);
});
