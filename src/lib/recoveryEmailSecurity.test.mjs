import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requireCompanyResource } from "./auth/apiAuthorizationCore.mjs";

const adminRouteUrl = new URL("../app/api/usuarios/[id]/recuperacion/route.js", import.meta.url);
const updateRouteUrl = new URL("../app/api/usuarios/[id]/route.js", import.meta.url);
const rootProfileRouteUrl = new URL("../app/api/auth/platform-profile/route.js", import.meta.url);
const rootMigrationUrl = new URL("../../supabase/migrations/20260822150000_platform_admin_profiles.sql", import.meta.url);

test("cliente no puede modificar ni recuperar usuarios de otra empresa", () => {
  const context = { role: "company_admin", portal: "client", companyId: "empresa-a" };
  assert.throws(
    () => requireCompanyResource(context, "empresa-b"),
    (error) => error?.status === 404 && error?.code === "RESOURCE_NOT_FOUND",
  );
});

test("recovery administrativo obtiene destinatario desde company_members y no desde el request", async () => {
  const source = await readFile(adminRouteUrl, "utf8");
  assert.match(source, /select\("user_id,company_id,role,status,recovery_email"\)/);
  assert.match(source, /recoveryEmail:\s*member\.recovery_email/);
  assert.match(source, /loginEmail:\s*authData\.user\.email/);
  assert.doesNotMatch(source, /request\.json/);
});

test("editar recovery_email no lo envía a Supabase Auth", async () => {
  const source = await readFile(updateRouteUrl, "utf8");
  assert.match(source, /memberUpdate/);
  assert.doesNotMatch(source, /authUpdate\.recovery/);
  assert.match(source, /authUpdate\.email = email/);
});

test("Mi cuenta deriva user_id de la sesión y vuelve a validar platform_admin", async () => {
  const source = await readFile(rootProfileRouteUrl, "utf8");
  assert.match(source, /requirePlatformAdmin\(authorization\.context\)/);
  assert.match(source, /getUserById\(authorization\.context\.userId\)/);
  assert.match(source, /assertSelfPlatformAdmin/);
  assert.match(source, /user_id:\s*authorized\.context\.userId/);
  assert.doesNotMatch(source, /input\?\.userId|body\?\.userId|targetUserId/);
});

test("platform_admin_profiles no concede acceso directo a anon/authenticated", async () => {
  const source = await readFile(rootMigrationUrl, "utf8");
  assert.match(source, /revoke all on public\.platform_admin_profiles from public, anon, authenticated/i);
  assert.match(source, /grant select, insert, update, delete on public\.platform_admin_profiles to service_role/i);
  assert.doesNotMatch(source, /grant .* to authenticated/i);
});
