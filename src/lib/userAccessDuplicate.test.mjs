// Usuario de acceso repetido (SOL-2026-10-29-012): Supabase Auth responde un
// 500 vacío, así que crear y editar verifican antes y avisan con un mensaje
// claro. Uso: node --test src/lib/userAccessDuplicate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buscarUsuarioPorEmail } from "./passwordRecoveryCore.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("buscarUsuarioPorEmail encuentra el usuario existente y recorre páginas", async () => {
  const pages = [Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, email: `user${i}@x.cl` })), [{ id: "dup", email: "operdos@gmail.com" }]];
  const db = { auth: { admin: { listUsers: async ({ page }) => ({ data: { users: pages[page - 1] || [] }, error: null }) } } };
  assert.equal((await buscarUsuarioPorEmail(db, "operdos@gmail.com"))?.id, "dup");
  assert.equal(await buscarUsuarioPorEmail(db, "nadie@x.cl"), null);
});

test("editar: el duplicado se rechaza con 409 antes de guardar cualquier cambio", async () => {
  const source = await read("../app/api/usuarios/[id]/route.js");
  const check = source.indexOf("buscarUsuarioPorEmail(db, email)");
  assert.ok(check > 0);
  assert.match(source, /existente && existente\.id !== id/);
  assert.ok(check < source.indexOf('from("company_member_parkings")') || source.indexOf('from("company_member_parkings")') < 0);
  assert.ok(check < source.indexOf("updateUserById"));
  assert.ok(check < source.indexOf(".update(memberUpdate)") || source.indexOf(".update(memberUpdate)") < 0);
});

test("crear: el duplicado se rechaza con 409 antes de crear el usuario", async () => {
  const source = await read("../app/api/usuarios/route.js");
  const check = source.indexOf("buscarUsuarioPorEmail(db, payload.email)");
  assert.ok(check > 0 && check < source.indexOf("db.auth.admin.createUser"));
  assert.match(source, /ya lo usa otra persona/);
});
