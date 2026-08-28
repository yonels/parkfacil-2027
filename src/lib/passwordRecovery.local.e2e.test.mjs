import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";
import { CANAL_ENTREGA_MICROSOFT, procesarRecuperacionContrasena } from "./passwordRecoveryCore.mjs";

function readLocalEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}

test("E2E local: login interno → recovery externo → nueva clave → mismo login", async (t) => {
  const env = readLocalEnv(await readFile(new URL("../../.env.local", import.meta.url), "utf8"));
  const localUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(localUrl || "")) {
    t.skip("Solo se ejecuta contra Supabase local.");
    return;
  }

  const admin = createClient(localUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = createClient(localUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } });
  const suffix = randomBytes(6).toString("hex");
  const login = `qa-recovery-${suffix}@usuarios.parkfacil.cl`;
  const recoveryEmail = `qa-recovery-${suffix}@example.com`;
  const initialPassword = `Pf!Initial-${randomBytes(8).toString("hex")}9a`;
  const newPassword = `Pf!Updated-${randomBytes(8).toString("hex")}9a`;
  let userId = null;

  try {
    const created = await admin.auth.admin.createUser({
      email: login,
      password: initialPassword,
      email_confirm: true,
      app_metadata: { role: "operator", company_id: "emp-5q", access_scope: "pos_only" },
      user_metadata: { full_name: "QA Recovery E2E", must_change_password: true },
    });
    assert.ifError(created.error);
    userId = created.data.user.id;

    const member = await admin.from("company_members").insert({
      user_id: userId,
      company_id: "emp-5q",
      full_name: "QA Recovery E2E",
      role: "operator",
      status: "active",
      pos_only: true,
      must_change_password: true,
      recovery_email: recoveryEmail,
    });
    assert.ifError(member.error);

    let delivered = null;
    const result = await procesarRecuperacionContrasena({
      portal: "cliente",
      redirectTo: "http://localhost:3000/nueva-contrasena",
      loginIdentifier: login,
      supabase: admin,
      enviarCorreo: async (message) => { delivered = message; },
      canalEntrega: CANAL_ENTREGA_MICROSOFT,
    });
    assert.equal(result.status, 200);
    assert.equal(delivered?.para, recoveryEmail);

    const actionLinkMatch = delivered.texto.match(/https?:\/\/\S+/);
    assert.ok(actionLinkMatch, "El proveedor recibió un action_link");
    const verification = await fetch(actionLinkMatch[0], { redirect: "manual" });
    const location = verification.headers.get("location");
    assert.ok(location, "Supabase redirigió a nueva-contrasena");
    const callback = new URL(location, actionLinkMatch[0]);
    assert.equal(callback.pathname, "/nueva-contrasena");

    const fragment = new URLSearchParams(callback.hash.slice(1));
    assert.equal(fragment.get("type"), "recovery");
    const session = await anon.auth.setSession({
      access_token: fragment.get("access_token"),
      refresh_token: fragment.get("refresh_token"),
    });
    assert.ifError(session.error);
    assert.equal(session.data.user.id, userId);

    const updated = await anon.auth.updateUser({ password: newPassword });
    assert.ifError(updated.error);
    await anon.auth.signOut();

    const loginResult = await anon.auth.signInWithPassword({ email: login, password: newPassword });
    assert.ifError(loginResult.error);
    assert.equal(loginResult.data.user.id, userId);
    assert.equal(loginResult.data.user.email, login);
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
