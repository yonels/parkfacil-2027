import assert from "node:assert/strict";
import test from "node:test";

import { assertSelfPlatformAdmin, normalizePlatformAdminProfileInput } from "./platformAdminProfileCore.mjs";

const context = { userId: "root-1", portal: "root", role: "platform_admin" };
const targetUser = { id: "root-1", app_metadata: { role: "platform_admin" } };

test("normaliza recovery Root, acepta NULL y rechaza formato inválido", () => {
  assert.deepEqual(normalizePlatformAdminProfileInput({ recoveryEmail: " Info@ParkFacil.CL " }), { recoveryEmail: "info@parkfacil.cl", error: null });
  assert.deepEqual(normalizePlatformAdminProfileInput({ recoveryEmail: "" }), { recoveryEmail: null, error: null });
  assert.equal(normalizePlatformAdminProfileInput({ recoveryEmail: "inválido" }).error, "El correo de recuperación no es válido.");
});

test("solo autoriza al propio Root y vuelve a verificar el rol objetivo", () => {
  assert.deepEqual(assertSelfPlatformAdmin({ context, targetUser }), { ok: true });
  assert.equal(assertSelfPlatformAdmin({ context, targetUser: { ...targetUser, id: "root-2" } }).code, "ROOT_PROFILE_NOT_FOUND");
  assert.equal(assertSelfPlatformAdmin({ context, targetUser: { ...targetUser, app_metadata: { role: "company_admin" } } }).code, "PLATFORM_ADMIN_ROLE_REQUIRED");
  assert.equal(assertSelfPlatformAdmin({ context: { ...context, portal: "client" }, targetUser }).code, "PLATFORM_ADMIN_REQUIRED");
});
