import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mapAuthorizedUsers } from "./usersRepositoryCore.mjs";
import { buildUserProfileUpdate } from "./userProfileUpdateCore.mjs";

const uiUrl = new URL("../components/usuarios/UsuariosPorRolClient.js", import.meta.url);
const createUrl = new URL("../app/api/usuarios/route.js", import.meta.url);
const updateUrl = new URL("../app/api/usuarios/[id]/route.js", import.meta.url);
const recoveryUrl = new URL("../app/api/usuarios/[id]/recuperacion/route.js", import.meta.url);
const detailUrl = new URL("../components/usuarios/UsuarioDetalleClient.js", import.meta.url);

test("listado separa usuarioAcceso y recoveryEmail", () => {
  const [user] = mapAuthorizedUsers({ members: [{ user_id: "u1", company_id: "c1", full_name: "Ana", role: "operator", status: "active", recovery_email: "seguridad@example.cl" }], authUsers: [{ id: "u1", email: "ana@usuarios.parkfacil.cl", user_metadata: {} }], companies: [], parkings: [], access: [] });
  assert.equal(user.usuarioAcceso, "ana@usuarios.parkfacil.cl"); assert.equal(user.recoveryEmail, "seguridad@example.cl");
});
test("cambiar recovery no cambia login y cambiar login no cambia recovery", () => {
  const recovery = buildUserProfileUpdate({ recoveryEmail: "Persona@Example.cl" }); assert.equal(recovery.email, undefined); assert.equal(recovery.memberUpdate.recovery_email, "persona@example.cl");
  const login = buildUserProfileUpdate({ usuarioAcceso: "login@example.cl" }); assert.equal(login.email, "login@example.cl"); assert.equal(login.memberUpdate.recovery_email, undefined);
});
test("fichas y creación de administrador/operador usan modal completo sin edición inline", async () => {
  const source = await readFile(uiUrl, "utf8");
  for (const text of ["Ficha del usuario", "Datos personales", "Acceso a ParkFacil", "Seguridad", "Usuario de acceso", "Correo de recuperación", "Estacionamiento(s) asignado(s)"]) assert.match(source, new RegExp(text.replace(/[()]/g, "\\$&")));
  assert.match(source, /ReadOnlyData label="Perfil"/); assert.match(source, /ReadOnlyData label="Empresa"/);
  assert.match(source, /role === "company_admin"/); assert.match(source, /role === "operator"|getPerfilLabel\(role\)/); assert.doesNotMatch(source, /Nueva contraseña|Confirmar contraseña|Establecer nueva clave/);
});
test("usuario sin recovery deshabilita envío y usuario con recovery confirma", async () => { const source = await readFile(uiUrl, "utf8"); assert.match(source, /disabled={!draft\.recoveryEmail/); assert.match(source, /Debes configurar un correo de recuperación/); assert.match(source, /window\.confirm/); });
test("creación requiere login y recovery", async () => { const source = await readFile(createUrl, "utf8"); assert.match(source, /errors\.email/); assert.match(source, /errors\.recoveryEmail/); assert.match(source, /recovery_email: payload\.recoveryEmail/); });
test("PATCH valida empresa de estacionamientos y conserva user_id", async () => { const source = await readFile(updateUrl, "utf8"); assert.match(source, /eq\("company_id", member\.company_id\)/); assert.match(source, /requireCompanyResource/); assert.match(source, /user_id: id/); assert.doesNotMatch(source, /company_id:\s*payload/); });
test("recovery administrativo no acepta destinatario arbitrario", async () => { const source = await readFile(recoveryUrl, "utf8"); assert.doesNotMatch(source, /request\.json/); assert.match(source, /recoveryEmail: member\.recovery_email/); assert.match(source, /requireCompanyResource/); });
test("ficha de consulta conserva sus datos y reutiliza el modal compartido", async () => {
  const source = await readFile(detailUrl, "utf8");
  for (const text of ["Datos del usuario", "Usuario de acceso", "Correo de recuperación", "Nombre completo", "Teléfono", "Rol", "Fecha de creación", "Último acceso", "Empresa", "Estacionamientos asignados", "Permisos actuales", "Seguridad"]) assert.match(source, new RegExp(text));
  assert.match(source, /import \{ UsuarioFichaModal \}/); assert.match(source, /<UsuarioFichaModal/); assert.match(source, /disabled={!usuario\.recoveryEmail/); assert.match(source, /recoveryEmail \|\| "Sin configurar"/);
});
