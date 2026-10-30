// El administrador de empresa fija usuario y clave de sus operadores
// (SOL-2026-10-29-011). Uso: node --test src/lib/userCredentialOperatorAdmin.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canSetDirectPassword, normalizeAccessUsername } from "./userCredentialCore.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("clave directa: Root con cualquiera; administrador de empresa solo con operadores", () => {
  const root = { role: "platform_admin", portal: "root" };
  const admin = { role: "company_admin", portal: "client", companyId: "c1" };
  assert.equal(canSetDirectPassword(root, "company_admin"), true);
  assert.equal(canSetDirectPassword(root, "operator"), true);
  assert.equal(canSetDirectPassword({ role: "platform_admin", portal: "client" }, "operator"), false);
  assert.equal(canSetDirectPassword(admin, "operator"), true);
  assert.equal(canSetDirectPassword(admin, "company_admin"), false);
  assert.equal(canSetDirectPassword({ role: "operator", portal: "terminal" }, "operator"), false);
  assert.equal(canSetDirectPassword({ role: "company_admin", portal: "terminal" }, "operator"), false);
});

test("usuario de acceso: correo o usuario simple", () => {
  assert.deepEqual(normalizeAccessUsername("Ana@Empresa.cl"), { email: "ana@empresa.cl", error: null });
  assert.deepEqual(normalizeAccessUsername("operuno"), { email: "operuno@acceso.parkfacilapp.cl", error: null });
  assert.ok(normalizeAccessUsername("").error);
  assert.ok(normalizeAccessUsername("ab").error);
  assert.ok(normalizeAccessUsername("con espacio").error);
  assert.ok(normalizeAccessUsername("mal@correo").error);
});

test("rutas: la clave directa valida empresa y rol del usuario; crear acepta clave solo si se permite", async () => {
  const credential = await read("../app/api/usuarios/[id]/credencial/route.js");
  assert.match(credential, /requireCompanyResource\(authorization\.context, member\.company_id\)/);
  assert.match(credential, /isDirectChange && !canSetDirectPassword\(authorization\.context, member\.role\)/);
  assert.ok(credential.indexOf("requireCompanyResource(") < credential.indexOf("canSetDirectPassword(authorization.context, member.role)"));
  const create = await read("../app/api/usuarios/route.js");
  assert.match(create, /canSetDirectPassword\(authorization\.context, payload\.role\)/);
  assert.match(create, /validateDirectPassword\(payload\.password\)/);
  assert.match(create, /const mustChangePassword = !adminDefinedPassword;/);
});
