import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";
import { resendCompanyEnrollment } from "./companyEnrollmentResendCore.mjs";

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

// E2E local contra Supabase Auth real (encargo "cierre de reenvío de
// enrolamiento" 2026-09-10, §5/§13-A/§13-G): demuestra exactamente lo que
// pide el punto 5 del encargo -- username antes = username después,
// user_id antes = user_id después, la clave anterior queda rechazada, la
// clave nueva es aceptada, y un segundo reenvío repite lo mismo (misma
// identidad, nueva rotación, sin recrear auth.users).
test("E2E local: reenvío de enrolamiento rota la clave preservando identidad -- clave anterior rechazada, clave nueva aceptada", async (t) => {
  const env = readLocalEnv(await readFile(new URL("../../.env.local", import.meta.url), "utf8"));
  const localUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(localUrl || "")) {
    t.skip("Solo se ejecuta contra Supabase local.");
    return;
  }

  const admin = createClient(localUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = createClient(localUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, detectSessionInUrl: false } });
  const suffix = randomBytes(6).toString("hex");
  const companyId = `emp-qa-resend-${suffix}`;
  const contactEmail = `contacto-qa-resend-${suffix}@example.com`;
  const login = `pfadmin-qa-${suffix}@acceso.parkfacilapp.cl`;
  const initialPassword = `Pf!Initial-${randomBytes(8).toString("hex")}9a`;
  let userId = null;

  try {
    const company = await admin.from("companies").insert({
      id: companyId, rut_number: String(90000000 + Math.floor(Math.random() * 9000000)), rut_dv: "5",
      business_name: "QA Resend E2E", trade_name: "QA Resend E2E", business_activity: "N/A",
      address: "N/A", city: "Santiago", primary_contact: "QA Admin", email: contactEmail, phone: "N/A",
      legal_representative: "N/A", status: "active", relationship_type: "client", enabled_products: ["OFF_STREET"],
    }).select("id").single();
    assert.ifError(company.error);

    const created = await admin.auth.admin.createUser({
      email: login, password: initialPassword, email_confirm: true,
      app_metadata: { role: "company_admin", company_id: companyId, access_scope: "company" },
      user_metadata: { full_name: "QA Admin Resend", must_change_password: true },
    });
    assert.ifError(created.error);
    userId = created.data.user.id;

    const member = await admin.from("company_members").insert({
      user_id: userId, company_id: companyId, full_name: "QA Admin Resend", role: "company_admin",
      status: "active", pos_only: false, must_change_password: true,
    });
    assert.ifError(member.error);

    // Confirma que la clave inicial sí funciona antes de rotar.
    const loginBefore = await anon.auth.signInWithPassword({ email: login, password: initialPassword });
    assert.ifError(loginBefore.error);
    assert.equal(loginBefore.data.user.id, userId);
    await anon.auth.signOut();

    let delivered = null;
    const sendMail = async (payload) => { delivered = payload; return { ok: true, remitente: "no-reply@parkfacil.cl" }; };

    // --- Primer reenvío ---
    const first = await resendCompanyEnrollment({ supabase: admin, companyId, requestedBy: null, sendMail, cooldownSeconds: 0 });
    assert.equal(first.enrollment.emailSent, true);
    assert.equal(delivered.para, contactEmail, "el correo va SIEMPRE al contacto de la empresa, nunca al email técnico");
    assert.doesNotMatch(delivered.html, /@acceso\.parkfacilapp\.cl/, "el email técnico interno nunca debe aparecer en el correo");

    const [account] = first.accounts;
    assert.equal(account.username, `pfadmin-qa-${suffix}`, "el usuario de acceso (sin dominio) se mantiene igual al ya existente");

    // Identidad preservada: mismo user_id, mismo email interno en auth.users.
    const authAfterFirst = await admin.auth.admin.getUserById(userId);
    assert.equal(authAfterFirst.data.user.id, userId);
    assert.equal(authAfterFirst.data.user.email, login);

    // Clave anterior rechazada, no queda "recuperable" de ninguna forma.
    const loginWithOldPassword = await anon.auth.signInWithPassword({ email: login, password: initialPassword });
    assert.ok(loginWithOldPassword.error, "la clave anterior debe quedar invalidada de inmediato");

    // La extraigo del correo simulado para probar que la clave NUEVA sí funciona
    // (nunca la leo de una tabla -- solo existe en el payload que se \"envió\").
    const passwordMatch = delivered.html.match(/font-family:monospace;">([^<]+)<\/td>/);
    assert.ok(passwordMatch, "el correo debe contener la clave temporal nueva");
    const newPassword = passwordMatch[1];

    const loginWithNewPassword = await anon.auth.signInWithPassword({ email: login, password: newPassword });
    assert.ifError(loginWithNewPassword.error);
    assert.equal(loginWithNewPassword.data.user.id, userId, "sigue siendo la MISMA cuenta -- no se creó una nueva");
    await anon.auth.signOut();

    // --- Segundo reenvío: misma identidad, nueva rotación, sin recrear nada ---
    const second = await resendCompanyEnrollment({ supabase: admin, companyId, requestedBy: null, sendMail, cooldownSeconds: 0 });
    assert.equal(second.accounts[0].username, account.username, "el username no cambia entre reenvíos");
    const authAfterSecond = await admin.auth.admin.getUserById(userId);
    assert.equal(authAfterSecond.data.user.id, userId, "sigue siendo el mismo user_id tras un segundo reenvío");

    const secondPasswordMatch = delivered.html.match(/font-family:monospace;">([^<]+)<\/td>/);
    const secondPassword = secondPasswordMatch[1];
    assert.notEqual(secondPassword, newPassword, "el segundo reenvío rota a una clave distinta de la primera rotación");

    const loginWithFirstRotatedPassword = await anon.auth.signInWithPassword({ email: login, password: newPassword });
    assert.ok(loginWithFirstRotatedPassword.error, "la clave de la primera rotación también queda invalidada tras la segunda");

    const loginWithSecondPassword = await anon.auth.signInWithPassword({ email: login, password: secondPassword });
    assert.ifError(loginWithSecondPassword.error);
    assert.equal(loginWithSecondPassword.data.user.id, userId);
    await anon.auth.signOut();
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from("company_enrollment_notifications").delete().eq("company_id", companyId);
    await admin.from("company_members").delete().eq("company_id", companyId);
    await admin.from("companies").delete().eq("id", companyId);
  }
});
