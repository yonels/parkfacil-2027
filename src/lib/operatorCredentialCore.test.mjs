import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canViewOperatorCredentials, decryptOperatorPassword, encryptOperatorPassword, operatorCredentialRows } from "./operatorCredentialCore.mjs";
import { CANAL_ENTREGA_MICROSOFT, procesarRecuperacionContrasena } from "./passwordRecoveryCore.mjs";

const SECRET = "x".repeat(32);
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("la clave se cifra y se recupera; el texto cifrado no la contiene ni se repite", () => {
  const first = encryptOperatorPassword("Clave-Secreta1", SECRET);
  const second = encryptOperatorPassword("Clave-Secreta1", SECRET);
  assert.notEqual(first, second);
  assert.ok(!first.includes("Clave-Secreta1"));
  assert.equal(decryptOperatorPassword(first, SECRET), "Clave-Secreta1");
});

test("sin llave válida, o con otra llave, no se cifra ni se lee", () => {
  assert.throws(() => encryptOperatorPassword("Clave", "corta"), /llave de cifrado/);
  const payload = encryptOperatorPassword("Clave", SECRET);
  assert.throws(() => decryptOperatorPassword(payload, "y".repeat(32)));
  assert.throws(() => decryptOperatorPassword("no-valida", SECRET), /no es válida/);
});

test("solo el administrador de empresa en el Portal Cliente ve las claves", () => {
  assert.equal(canViewOperatorCredentials({ role: "company_admin", portal: "client" }), true);
  assert.equal(canViewOperatorCredentials({ role: "company_admin", portal: "root" }), false);
  assert.equal(canViewOperatorCredentials({ role: "platform_admin", portal: "root" }), false);
  assert.equal(canViewOperatorCredentials({ role: "operator", portal: "client" }), false);
});

test("el reporte lista solo operadores, sin claves, y marca los que no tienen registro", () => {
  const rows = operatorCredentialRows([
    { id: "1", perfilPrincipal: "operator", nombreCompleto: "Beta", usuarioAcceso: "beta" },
    { id: "2", perfilPrincipal: "company_admin", nombreCompleto: "Admin", usuarioAcceso: "admin" },
    { id: "3", perfilPrincipal: "operator", nombreCompleto: "Alfa", usuarioAcceso: "alfa" },
  ], [{ user_id: "1", updated_at: "2026-11-04T10:00:00Z", password_ciphertext: "v1.a.b.c" }]);
  assert.deepEqual(rows.map((row) => [row.nombre, row.hasCredential]), [["Alfa", false], ["Beta", true]]);
  assert.ok(!JSON.stringify(rows).includes("v1.a.b.c"));
});

test("la recuperación por correo no se envía a un operador y responde igual que a otros", async () => {
  const enviados = [];
  const usuario = { id: "op-1", email: "op@empresa.cl", email_confirmed_at: "2026-01-01T00:00:00Z", deleted_at: null, banned_until: null, app_metadata: { role: "operator" } };
  const fila = { company_id: "emp", role: "operator", status: "active", pos_only: true, recovery_email: "op@empresa.cl" };
  // Consulta encadenable: la membresía, la empresa y el contrato responden con una fila válida.
  const consulta = new Proxy({}, { get: (_target, name) => { if (name === "then") return (resolve) => resolve({ data: [fila], error: null }); if (name === "maybeSingle") return async () => ({ data: fila, error: null }); return () => consulta; } });
  const supabase = { from: () => consulta, auth: { admin: { listUsers: async () => ({ data: { users: [usuario] }, error: null }), generateLink: async () => ({ data: { properties: { action_link: "https://x/?token=abc" } }, error: null }) } } };
  const resultado = await procesarRecuperacionContrasena({ portal: "cliente", redirectTo: "https://cliente.parkfacilapp.cl/nueva-contrasena", email: usuario.email, supabase, enviarCorreo: async (mail) => { enviados.push(mail); }, canalEntrega: CANAL_ENTREGA_MICROSOFT });
  assert.equal(enviados.length, 0);
  assert.equal(resultado.ok, true);
});

test("toda ruta que fija la clave de un operador guarda la copia y las lecturas se auditan", async () => {
  assert.match(await read("../app/api/usuarios/[id]/credencial/route.js"), /member\.role === "operator"\s*\? await saveOperatorCredential/);
  assert.match(await read("../app/api/usuarios/route.js"), /payload\.role === ROLES\.OPERATOR\) \{\s*await saveOperatorCredential/);
  assert.match(await read("../app/api/usuarios/[id]/recuperacion/route.js"), /OPERATOR_RECOVERY_DISABLED/);
  const server = await read("./operatorCredentialServer.js");
  assert.match(server, /action: "VIEWED"/);
  assert.ok(!/console\.\w+\([^)]*password/.test(server));
  const list = await read("../app/api/usuarios/claves/route.js");
  assert.ok(!list.includes("password_ciphertext"), "la lista no lee claves");
  const migration = await read("../../supabase/migrations/20261104150000_operator_credentials.sql");
  assert.match(migration, /revoke all on table public\.operator_credentials from public, anon, authenticated/);
  assert.match(migration, /operator_credentials enable row level security/);
});
