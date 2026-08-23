import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";
import { procesarRecuperacionContrasena } from "./passwordRecoveryCore.mjs";

function readLocalEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line)).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^"|"$/g, "")];
  }));
}

async function localClients(t) {
  const env = readLocalEnv(await readFile(new URL("../../.env.local", import.meta.url), "utf8"));
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(env.NEXT_PUBLIC_SUPABASE_URL || "")) {
    t.skip("Solo se ejecuta contra Supabase local.");
    return null;
  }
  return {
    admin: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    anon: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } }),
  };
}

test("Root local real resuelve recovery por user_id sin modificar root@parkfacilapp.cl", async (t) => {
  const clients = await localClients(t);
  if (!clients) return;
  const { admin } = clients;
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.ifError(users.error);
  const root = users.data.users.find((user) => user.email === "root@parkfacilapp.cl");
  assert.ok(root, "Existe el Root QA local esperado");
  assert.equal(root.app_metadata?.role, "platform_admin");

  const previous = await admin.from("platform_admin_profiles").select("recovery_email").eq("user_id", root.id).maybeSingle();
  assert.ifError(previous.error);
  const recoveryEmail = "qa-root-recovery@example.com";
  try {
    const saved = await admin.from("platform_admin_profiles").upsert({ user_id: root.id, recovery_email: recoveryEmail }, { onConflict: "user_id" });
    assert.ifError(saved.error);
    let generatedFor = null;
    let deliveredTo = null;
    const wrapped = {
      from: (...args) => admin.from(...args),
      auth: { admin: {
        listUsers: (...args) => admin.auth.admin.listUsers(...args),
        generateLink: async (args) => { generatedFor = args.email; return admin.auth.admin.generateLink(args); },
      } },
    };
    const result = await procesarRecuperacionContrasena({
      portal: "root",
      redirectTo: "http://localhost:3000/nueva-contrasena",
      loginIdentifier: root.email,
      supabase: wrapped,
      enviarCorreo: async (message) => { deliveredTo = message.para; },
    });
    assert.equal(result.status, 200);
    assert.equal(generatedFor, "root@parkfacilapp.cl");
    assert.equal(deliveredTo, recoveryEmail);
    const after = await admin.auth.admin.getUserById(root.id);
    assert.equal(after.data.user.email, "root@parkfacilapp.cl");
  } finally {
    if (previous.data) {
      await admin.from("platform_admin_profiles").upsert({ user_id: root.id, recovery_email: previous.data.recovery_email }, { onConflict: "user_id" });
    } else {
      await admin.from("platform_admin_profiles").delete().eq("user_id", root.id);
    }
  }
});

test("E2E Root local: recovery externo → nueva clave → mismo Usuario de acceso", async (t) => {
  const clients = await localClients(t);
  if (!clients) return;
  const { admin, anon } = clients;
  const suffix = randomBytes(6).toString("hex");
  const login = `qa-root-${suffix}@parkfacilapp.cl`;
  const recoveryEmail = `qa-root-${suffix}@example.com`;
  const initialPassword = `Pf!Initial-${randomBytes(8).toString("hex")}9a`;
  const newPassword = `Pf!Updated-${randomBytes(8).toString("hex")}9a`;
  let userId = null;
  try {
    const created = await admin.auth.admin.createUser({ email: login, password: initialPassword, email_confirm: true, app_metadata: { role: "platform_admin" } });
    assert.ifError(created.error);
    userId = created.data.user.id;
    const profile = await admin.from("platform_admin_profiles").insert({ user_id: userId, recovery_email: recoveryEmail });
    assert.ifError(profile.error);

    let delivered = null;
    const result = await procesarRecuperacionContrasena({
      portal: "root",
      redirectTo: "http://localhost:3000/nueva-contrasena",
      loginIdentifier: login,
      supabase: admin,
      enviarCorreo: async (message) => { delivered = message; },
    });
    assert.equal(result.status, 200);
    assert.equal(delivered?.para, recoveryEmail);

    const actionLink = delivered.texto.match(/https?:\/\/\S+/)?.[0];
    assert.ok(actionLink);
    const verification = await fetch(actionLink, { redirect: "manual" });
    const callback = new URL(verification.headers.get("location"), actionLink);
    assert.equal(callback.pathname, "/nueva-contrasena");
    const fragment = new URLSearchParams(callback.hash.slice(1));
    const session = await anon.auth.setSession({ access_token: fragment.get("access_token"), refresh_token: fragment.get("refresh_token") });
    assert.ifError(session.error);
    assert.equal(session.data.user.id, userId);
    const updated = await anon.auth.updateUser({ password: newPassword });
    assert.ifError(updated.error);
    await anon.auth.signOut();
    const signedIn = await anon.auth.signInWithPassword({ email: login, password: newPassword });
    assert.ifError(signedIn.error);
    assert.equal(signedIn.data.user.id, userId);
    assert.equal(signedIn.data.user.email, login);
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
