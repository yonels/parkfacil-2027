import test from "node:test";
import assert from "node:assert/strict";
import { getSecurityModules, getOrganizationProfiles } from "./seguridad.mjs";

test("getSecurityModules returns a complete staged overview", () => {
  const modules = getSecurityModules();

  assert.equal(Array.isArray(modules), true);
  assert.ok(modules.length >= 3);
  assert.equal(modules[0].title, "Controles de acceso");
});

test("getOrganizationProfiles returns organizational views with status metadata", () => {
  const organizations = getOrganizationProfiles();

  assert.equal(Array.isArray(organizations), true);
  assert.ok(organizations.length >= 2);
  assert.ok(organizations[0].status);
});
