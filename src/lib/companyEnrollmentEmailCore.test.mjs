import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyEnrollmentEmailHtml, sendCompanyEnrollmentEmail } from "./companyEnrollmentEmailCore.mjs";

const ACCOUNTS = [
  { label: "Administrador", fullName: "Ana Pérez", username: "pfadmin7f3k9a", role: "company_admin", password: "Pf!secretoTemp1" },
  { label: "Operador 1", fullName: "Beto Soto", username: "pfop1a2b3c", role: "operator", password: "Pf!secretoTemp2" },
  { label: "Operador 2", fullName: "Carla Díaz", username: "pfop9x8y7z", role: "operator", password: "Pf!secretoTemp3" },
];

function createSupabase({ traceInsertError = null } = {}) {
  const traces = [];
  return {
    traces,
    from(table) {
      const state = { table, op: "select", values: null };
      const api = {
        select() { return api; },
        eq() { return api; },
        insert(values) { state.op = "insert"; state.values = values; return api; },
        update(values) { state.op = "update"; state.values = values; return api; },
        single: async () => {
          if (state.op === "insert" && table === "company_enrollment_notifications") {
            if (traceInsertError) return { data: null, error: traceInsertError };
            const id = `trace-${traces.length + 1}`;
            traces.push({ id, ...state.values });
            return { data: { id }, error: null };
          }
          return { data: null, error: { message: "not found" } };
        },
        then(resolve) {
          if (state.op === "update" && table === "company_enrollment_notifications") {
            traces.push({ update: true, ...state.values });
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return api;
    },
  };
}

test("buildCompanyEnrollmentEmailHtml: incluye empresa, cada usuario y cada clave -- nunca un correo individual como destinatario", () => {
  const html = buildCompanyEnrollmentEmailHtml({ company: { businessName: "Parkfacil SpA" }, accounts: ACCOUNTS });
  assert.match(html, /Parkfacil SpA/);
  for (const account of ACCOUNTS) {
    assert.match(html, new RegExp(account.username));
    assert.match(html, new RegExp(account.password.replace(/[!]/g, "\\!")));
    assert.match(html, new RegExp(account.fullName));
  }
  assert.match(html, /cliente\.parkfacilapp\.cl/);
});

test("buildCompanyEnrollmentEmailHtml: incluye el rol de cada cuenta", () => {
  const html = buildCompanyEnrollmentEmailHtml({ company: { businessName: "Parkfacil SpA" }, accounts: ACCOUNTS });
  assert.match(html, /Administrador de empresa/);
  assert.match(html, /Operador/);
});

test("buildCompanyEnrollmentEmailHtml: isResend agrega el aviso de invalidación de claves anteriores, el envío inicial no", () => {
  const resend = buildCompanyEnrollmentEmailHtml({ company: { businessName: "Parkfacil SpA" }, accounts: ACCOUNTS, isResend: true });
  const initial = buildCompanyEnrollmentEmailHtml({ company: { businessName: "Parkfacil SpA" }, accounts: ACCOUNTS, isResend: false });
  assert.match(resend, /ya no (es|son) válida/i);
  assert.doesNotMatch(initial, /ya no (es|son) válida/i);
});

test("sendCompanyEnrollmentEmail: éxito -- registra pending luego sent, nunca guarda la clave en la traza", async () => {
  const supabase = createSupabase();
  const sendMail = async (payload) => {
    assert.equal(payload.para, "info@cliente.cl");
    assert.match(payload.html, /pfadmin7f3k9a/);
    return { ok: true, remitente: "no-reply@parkfacil.cl" };
  };
  const result = await sendCompanyEnrollmentEmail({
    supabase, companyId: "emp-1", company: { businessName: "Parkfacil SpA" },
    contactEmail: "info@cliente.cl", accounts: ACCOUNTS, sendMail,
  });
  assert.equal(result.ok, true);
  const insertedTrace = supabase.traces.find((t) => t.estado === "pending");
  const updatedTrace = supabase.traces.find((t) => t.update && t.estado === "sent");
  assert.ok(insertedTrace, "debe insertar una traza pending antes de enviar");
  assert.ok(updatedTrace, "debe actualizar la traza a sent tras el envío exitoso");
  assert.equal(insertedTrace.destinatario, "info@cliente.cl");
  for (const trace of supabase.traces) {
    assert.equal(JSON.stringify(trace).includes(ACCOUNTS[0].password), false, "la traza jamás debe contener la clave");
  }
});

test("sendCompanyEnrollmentEmail: registra auditoría mínima (quién lo pidió, cuántas cuentas) sin guardar secretos", async () => {
  const supabase = createSupabase();
  const sendMail = async () => ({ ok: true, remitente: "no-reply@parkfacil.cl" });
  await sendCompanyEnrollmentEmail({
    supabase, companyId: "emp-1", company: { businessName: "Parkfacil SpA" },
    contactEmail: "info@cliente.cl", accounts: ACCOUNTS, requestedBy: "root-user-id-123", sendMail,
  });
  const insertedTrace = supabase.traces.find((t) => t.estado === "pending");
  assert.equal(insertedTrace.requested_by, "root-user-id-123");
  assert.equal(insertedTrace.accounts_count, 3);
});

test("sendCompanyEnrollmentEmail: fallo de envío -- se registra failed, se retorna ok:false, y NUNCA lanza (no debe disparar el rollback de creación)", async () => {
  const supabase = createSupabase();
  const sendMail = async () => { throw new Error("Microsoft Graph rechazó el envío"); };
  const result = await sendCompanyEnrollmentEmail({
    supabase, companyId: "emp-1", company: { businessName: "Parkfacil SpA" },
    contactEmail: "info@cliente.cl", accounts: ACCOUNTS, sendMail,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Microsoft Graph rechazó el envío/);
  const updatedTrace = supabase.traces.find((t) => t.update && t.estado === "failed");
  assert.ok(updatedTrace, "debe registrar el fallo en la traza para permitir reintento");
});
