import assert from "node:assert/strict";
import test from "node:test";
import { resendCompanyEnrollment, CompanyEnrollmentResendError, RESEND_COOLDOWN_SECONDS } from "./companyEnrollmentResendCore.mjs";

const COMPANY = { id: "emp-1", business_name: "Parkfacil SpA", email: "info@cliente.cl" };
const MEMBERS = [
  { user_id: "u-admin", company_id: "emp-1", full_name: "Ana Pérez", role: "company_admin" },
  { user_id: "u-op1", company_id: "emp-1", full_name: "Beto Soto", role: "operator" },
  { user_id: "u-op2", company_id: "emp-1", full_name: "Carla Díaz", role: "operator" },
];

function createSupabase({ company = COMPANY, members = MEMBERS, lastNotificationAt = null, authEmailByUser = {} } = {}) {
  const updatedPasswords = {}; // user_id -> password nueva enviada a updateUserById
  const memberUpdates = [];
  const traces = [];

  return {
    updatedPasswords,
    memberUpdates,
    traces,
    from(table) {
      const state = { op: "select", values: null };
      const api = {
        select() { return api; },
        eq(column, value) { state.filterCol = column; state.filterVal = value; return api; },
        in() { return api; },
        order() { return api; },
        limit() { return api; },
        insert(values) { state.op = "insert"; state.values = values; return api; },
        update(values) { state.op = "update"; state.values = values; return api; },
        maybeSingle: async () => {
          if (table === "companies") return { data: company, error: null };
          return { data: null, error: null };
        },
        single: async () => {
          if (table === "company_enrollment_notifications" && state.op === "insert") {
            const id = `trace-${traces.length + 1}`;
            traces.push({ id, ...state.values });
            return { data: { id }, error: null };
          }
          return { data: null, error: { message: "not found" } };
        },
        then(resolve) {
          if (table === "company_members" && state.op === "select") {
            return Promise.resolve({ data: members, error: null }).then(resolve);
          }
          if (table === "company_members" && state.op === "update") {
            memberUpdates.push({ userId: state.filterVal, values: state.values });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          if (table === "company_enrollment_notifications" && state.op === "select") {
            const rows = lastNotificationAt ? [{ created_at: lastNotificationAt }] : [];
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          if (table === "company_enrollment_notifications" && state.op === "update") {
            traces.push({ update: true, ...state.values });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return api;
    },
    auth: {
      admin: {
        getUserById: async (userId) => ({
          data: { user: { id: userId, email: authEmailByUser[userId] || `${userId}@acceso.parkfacilapp.cl`, user_metadata: { full_name: "x" } } },
          error: null,
        }),
        updateUserById: async (userId, values) => {
          updatedPasswords[userId] = values.password;
          return { data: { user: { id: userId } }, error: null };
        },
      },
    },
  };
}

test("resendCompanyEnrollment: rota clave de las 3 cuentas, preserva user_id/username/rol, nunca crea usuarios", async () => {
  const supabase = createSupabase();
  const sendMail = async () => ({ ok: true, remitente: "no-reply@parkfacil.cl" });
  const result = await resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail });

  assert.equal(result.enrollment.emailSent, true);
  assert.equal(result.accounts.length, 3);
  // user_id preservados: se rotó exactamente a los 3 miembros existentes, ninguno nuevo.
  assert.deepEqual(Object.keys(supabase.updatedPasswords).sort(), ["u-admin", "u-op1", "u-op2"]);
  // username = local-part del email técnico ya existente (nunca cambia, nunca se expone el dominio).
  const admin = result.accounts.find((a) => a.role === "company_admin");
  assert.equal(admin.username, "u-admin");
  assert.doesNotMatch(admin.username, /@/);
  // must_change_password se reafirma para cada cuenta rotada.
  for (const update of supabase.memberUpdates) assert.equal(update.values.must_change_password, true);
});

test("resendCompanyEnrollment: cada llamada genera una clave distinta (no reutiliza ni recupera la anterior)", async () => {
  const supabase = createSupabase();
  const sendMail = async () => ({ ok: true });
  await resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail });
  const firstRound = { ...supabase.updatedPasswords };

  const supabase2 = createSupabase();
  await resendCompanyEnrollment({ supabase: supabase2, companyId: "emp-1", requestedBy: "root-1", sendMail });
  for (const userId of Object.keys(firstRound)) {
    assert.notEqual(firstRound[userId], supabase2.updatedPasswords[userId]);
  }
});

test("resendCompanyEnrollment: respuesta HTTP/objeto nunca incluye la clave", async () => {
  const supabase = createSupabase();
  const sendMail = async () => ({ ok: true });
  const result = await resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail });
  assert.equal(JSON.stringify(result).includes("password"), false);
});

test("resendCompanyEnrollment: empresa inexistente -> error 404 controlado", async () => {
  const supabase = createSupabase({ company: null });
  await assert.rejects(
    () => resendCompanyEnrollment({ supabase, companyId: "emp-x", requestedBy: "root-1", sendMail: async () => ({ ok: true }) }),
    (error) => error instanceof CompanyEnrollmentResendError && error.status === 404 && error.code === "COMPANY_NOT_FOUND",
  );
});

test("resendCompanyEnrollment: empresa sin cuentas iniciales -> error controlado, no revienta", async () => {
  const supabase = createSupabase({ members: [] });
  await assert.rejects(
    () => resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail: async () => ({ ok: true }) }),
    (error) => error instanceof CompanyEnrollmentResendError && error.status === 409 && error.code === "NO_ACCOUNTS",
  );
});

test("resendCompanyEnrollment: fallo del proveedor de correo -- no revierte nada, las 3 claves ya rotadas quedan así, error se reporta sin lanzar", async () => {
  const supabase = createSupabase();
  const sendMail = async () => { throw new Error("Microsoft Graph rechazó el envío"); };
  const result = await resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail });
  assert.equal(result.enrollment.emailSent, false);
  assert.match(result.enrollment.error, /Microsoft Graph rechazó el envío/);
  // Las 3 cuentas sí se rotaron antes del intento de correo -- no hay rollback destructivo.
  assert.equal(Object.keys(supabase.updatedPasswords).length, 3);
});

test("resendCompanyEnrollment: protección contra doble clic -- un reenvío reciente bloquea el siguiente sin rotar nada", async () => {
  const supabase = createSupabase({ lastNotificationAt: new Date().toISOString() });
  await assert.rejects(
    () => resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail: async () => ({ ok: true }) }),
    (error) => error instanceof CompanyEnrollmentResendError && error.status === 429 && error.code === "RESEND_COOLDOWN",
  );
  assert.equal(Object.keys(supabase.updatedPasswords).length, 0, "no debe rotar ninguna clave si el cooldown bloquea");
});

test("resendCompanyEnrollment: fuera del cooldown, el reenvío procede normalmente", async () => {
  const old = new Date(Date.now() - (RESEND_COOLDOWN_SECONDS + 5) * 1000).toISOString();
  const supabase = createSupabase({ lastNotificationAt: old });
  const result = await resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail: async () => ({ ok: true }) });
  assert.equal(result.enrollment.emailSent, true);
  assert.equal(Object.keys(supabase.updatedPasswords).length, 3);
});

test("resendCompanyEnrollment: cuenta creada con email real (pre-existente al modelo de username) se muestra tal cual, nunca se le inventa un usuario técnico", async () => {
  const supabase = createSupabase({ authEmailByUser: { "u-admin": "admin@clinicaramis.cl" } });
  const result = await resendCompanyEnrollment({ supabase, companyId: "emp-1", requestedBy: "root-1", sendMail: async () => ({ ok: true }) });
  const admin = result.accounts.find((a) => a.role === "company_admin");
  assert.equal(admin.username, "admin@clinicaramis.cl");
});
