// Inspectores en el Catálogo de usuarios (SOL-2026-11-16-003).
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mapAuthorizedUsers } from "./usersRepositoryCore.mjs";
import { canSetDirectPassword } from "./userCredentialCore.mjs";
import { getPerfilLabel } from "../data/usuarios.mjs";

const src = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("el catálogo lista al inspector con su perfil, empresa y sin estacionamientos", () => {
  const [row] = mapAuthorizedUsers({
    members: [{ user_id: "i1", company_id: "emp-001", full_name: "Inspector Uno", role: "inspector", status: "active", recovery_email: "i@x.cl" }],
    authUsers: [{ id: "i1", email: "inspector@parkfacil.cl", user_metadata: { phone: "900000000" } }],
    companies: [{ id: "emp-001", trade_name: "ParkFacil Operaciones", business_name: "ParkFacil Operaciones Spa", rut_number: "77991619", rut_dv: "7" }],
    parkings: [],
    access: [],
  });
  assert.equal(row.perfilPrincipal, "inspector");
  assert.equal(row.cargo, "Inspector On Street");
  assert.equal(row.empresaId, "emp-001");
  assert.deepEqual(row.estacionamientos, []);
  assert.equal(getPerfilLabel("inspector"), "Inspector");
});

test("el administrador de empresa puede fijar la clave de sus inspectores y operadores, no la de otro administrador", () => {
  const admin = { role: "company_admin", portal: "client" };
  assert.equal(canSetDirectPassword(admin, "inspector"), true);
  assert.equal(canSetDirectPassword(admin, "operator"), true);
  assert.equal(canSetDirectPassword(admin, "company_admin"), false);
  assert.equal(canSetDirectPassword({ role: "operator", portal: "client" }, "inspector"), false);
});

test("POST /api/usuarios acepta el perfil inspector, sin estacionamientos y con app_metadata.role inspector", async () => {
  const source = await src("../app/api/usuarios/route.js");
  assert.match(source, /CREATE_ALLOWED_ROLES = new Set\(\[ROLES\.COMPANY_ADMIN, ROLES\.OPERATOR, ROLES\.INSPECTOR\]\)/);
  assert.match(source, /payload\.role === ROLES\.INSPECTOR \? \[\]/, "el inspector nunca recibe estacionamientos asignados");
  assert.match(source, /role: payload\.role,\r?\n\s+company_id: targetCompanyId/, "app_metadata lleva el rol (encierra la cuenta en /inspector) y la empresa");
  assert.match(source, /const targetCompanyId = scope \|\| payload\.companyId;/, "un administrador de empresa siempre crea en su propia empresa");
});

test("DELETE /api/usuarios/[id]: solo inspectores, de la misma empresa y sin fiscalizaciones (decisión P3)", async () => {
  const source = await src("../app/api/usuarios/[id]/route.js");
  const del = source.slice(source.indexOf("export async function DELETE"));
  assert.match(del, /requirePermission\(authorization\.context, PERMISSIONS\.USERS_MANAGE\)/);
  assert.match(del, /requireCompanyResource\(authorization\.context, member\.company_id\)/, "nunca borra un inspector de otra empresa");
  assert.match(del, /member\.role !== ROLES\.INSPECTOR/, "administradores y operadores no se eliminan, se desactivan");
  assert.match(del, /from\("on_street_inspections"\)[\s\S]*eq\("inspector_user_id", id\)/, "revisa sus fiscalizaciones antes de borrar");
  assert.match(del, /INSPECTOR_HAS_INSPECTIONS[\s\S]*status: 409/, "con fiscalizaciones se rechaza y se pide desactivar");
  assert.ok(del.indexOf("INSPECTOR_HAS_INSPECTIONS") < del.indexOf("deleteUser"), "el borrado ocurre solo después de comprobar que no hay fiscalizaciones");
});

test("PATCH /api/usuarios/[id] rechaza asignar estacionamientos a un inspector", async () => {
  const source = await src("../app/api/usuarios/[id]/route.js");
  assert.match(source, /member\.role === ROLES\.INSPECTOR && parkingIds\?\.length/);
});

test("clave y recuperación admiten inspectores", async () => {
  for (const path of ["../app/api/usuarios/[id]/credencial/route.js", "../app/api/usuarios/[id]/recuperacion/route.js"]) {
    assert.match(await src(path), /\["company_admin", "operator", "inspector"\]\.includes\(member\.role\)/, path);
  }
});

test("la migración amplía el CHECK de role y asigna los inspectores sin empresa a emp-001 sin tocar filas existentes", async () => {
  const sql = await src("../../supabase/migrations/20261116163300_company_members_inspector_role.sql");
  assert.match(sql, /check \(role in \('company_admin', 'operator', 'inspector'\)\)/);
  assert.match(sql, /and not exists \(select 1 from public\.company_members m where m\.user_id = u\.id\)/, "no duplica ni pisa membresías");
  assert.match(sql, /and exists \(select 1 from public\.companies c where c\.id = 'emp-001'\)/, "si emp-001 no existe no inserta nada");
  assert.doesNotMatch(sql, /\bdelete from\b|\bupdate public\.company_members\b/i, "cambio aditivo");
});
