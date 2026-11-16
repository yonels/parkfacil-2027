/******************************************************************
 * Usuario de prueba para /inspector/login (2026-08-31).
 *
 * Crea (o actualiza si ya existe) UN usuario real de Supabase Auth local
 * con app_metadata.role = "inspector" -- exactamente el mismo mecanismo que
 * lee resolveAuthenticatedContext() en src/lib/auth/contextCore.mjs (rol
 * Inspector se resuelve por app_metadata.role, sin fila de company_members,
 * ver esa función). No crea ninguna tabla ni fila nueva: usa
 * supabase.auth.admin, la misma API administrativa que ya usa el resto de
 * scripts *-e2e.mjs de este proyecto.
 *
 * Uso:
 *   node --env-file=.env.local scripts/local-inspector-create-test-user.mjs
 *
 * Solo contra Supabase LOCAL (mismo guard que el resto de scripts locales
 * -- ver scripts/local-on-street-seed-reportes-pagos.mjs).
 ******************************************************************/
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.match(url || "", /^http:\/\/(127\.0\.0\.1|localhost):54321$/, "Este script SOLO corre contra Supabase LOCAL");
assert.ok(serviceKey, "SUPABASE_SERVICE_ROLE_KEY requerida");

const TEST_EMAIL = "inspector.prueba@parkfacil.cl";
const TEST_PASSWORD = "Inspector#2026v3";

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUserByEmail(email) {
  // admin.listUsers() no filtra por email en esta versión del SDK local --
  // se pagina hasta encontrarlo (el proyecto local tiene pocos usuarios).
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(TEST_EMAIL);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, role: "inspector" },
    });
    if (error) throw error;
    console.log(`Usuario de prueba ACTUALIZADO: ${TEST_EMAIL} (id ${existing.id}), rol inspector, contraseña reseteada.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "inspector" },
    });
    if (error) throw error;
    console.log(`Usuario de prueba CREADO: ${TEST_EMAIL} (id ${data.user.id}), rol inspector.`);
  }

  console.log("\nCredenciales de prueba (solo Supabase LOCAL):");
  console.log(`  URL:        http://127.0.0.1:3000/inspector/login`);
  console.log(`  Correo:     ${TEST_EMAIL}`);
  console.log(`  Contraseña: ${TEST_PASSWORD}`);
}

main().catch((error) => {
  console.error("Error creando el usuario de prueba:", error);
  process.exit(1);
});
