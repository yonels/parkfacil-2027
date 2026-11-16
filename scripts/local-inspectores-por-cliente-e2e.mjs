// Prueba local de «Inspectores por cliente» (SOL-2026-11-16-003): base local + `next dev`
// local. Empresa A = test-company-inspector-e2e (On Street con sesiones QASM00x), empresa
// B = emp-5q (On Street «QA FINAL ON STREET»). Datos ficticios @parkfacil.test.
// Requiere la migración 20261116190000 aplicada en la base local.
//
// Uso: node --env-file=.env.local scripts/local-inspectores-por-cliente-e2e.mjs
//      (LOCAL_APP_URL=http://127.0.0.1:3161 y LOCAL_DB_PORT=6543 por defecto)
// Nunca imprime claves ni tokens de sesión.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) throw new Error("Solo base local.");
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3161";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(appUrl)) throw new Error("Solo servidor local.");
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sql = new pg.Client({ host: "127.0.0.1", port: Number(process.env.LOCAL_DB_PORT || 6543), user: "postgres", password: "postgres", database: "postgres" });

const COMPANY_A = "test-company-inspector-e2e";
const COMPANY_B = "emp-5q";
const PARKING_A = "08132f6d-2743-4866-97b0-fa855d59ada6";
const PARKING_B = "f7ecdfc1-58c1-4043-83ba-a16cb55e1201";
const PLATE_A_EXPIRED = "QASM006";
const results = [];
const record = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`); };
async function check(name, fn) { try { record(name, true, (await fn()) || ""); } catch (error) { record(name, false, error.message); } }
const tag = randomBytes(3).toString("hex");

async function ensureAdmin(email, companyId) {
  const password = `Aud-${randomBytes(12).toString("base64url")}!`;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = listed.data.users.find((u) => u.email === email);
  if (!user) user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
  else await admin.auth.admin.updateUserById(user.id, { password, app_metadata: {} });
  await sql.query(`insert into company_members (user_id, company_id, full_name, role, status, pos_only, must_change_password)
    values ($1, $2, 'Auditoría admin', 'company_admin', 'active', false, false)
    on conflict (user_id) do update set company_id = $2, role = 'company_admin', status = 'active', pos_only = false, must_change_password = false`, [user.id, companyId]);
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return session.data.session.access_token;
}

const clientHeaders = (token) => ({ authorization: `Bearer ${token}`, host: "cliente.localhost:3161", "x-forwarded-host": "cliente.localhost", "content-type": "application/json" });
const inspectorHeaders = (token) => ({ authorization: `Bearer ${token}`, "x-parkfacil-portal": "inspector", "content-type": "application/json" });
async function call(path, { method = "GET", headers, body } = {}) {
  const response = await fetch(`${appUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json };
}

async function createInspector(adminToken, label) {
  const email = `insp-${label}-${tag}@parkfacil.test`;
  const res = await call("/api/usuarios", { method: "POST", headers: clientHeaders(adminToken), body: { fullName: `Inspector ${label} E2E`, email, recoveryEmail: email, phone: "", role: "inspector", parkingIds: ["no-se-asigna"] } });
  assert.equal(res.status, 201, `crear inspector ${label}: ${res.status} ${res.body.error || ""}`);
  return { id: res.body.data.id, email, password: res.body.credential.temporaryPassword, row: res.body.data };
}

async function signIn(email, password) {
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return session.data.session.access_token;
}

await sql.connect();
try {
  const adminA = await ensureAdmin("admin-a-inspectores@parkfacil.test", COMPANY_A);
  const adminB = await ensureAdmin("admin-b-inspectores@parkfacil.test", COMPANY_B);
  let inspA; let inspB; let tokenA; let tokenB;

  await check("1. el administrador A crea un inspector en el Catálogo (201, perfil inspector, sin estacionamientos)", async () => {
    inspA = await createInspector(adminA, "a");
    assert.equal(inspA.row.perfilPrincipal, "inspector");
    assert.deepEqual(inspA.row.estacionamientos, [], "los estacionamientos enviados se ignoran");
    const { rows } = await sql.query("select company_id, role from company_members where user_id = $1", [inspA.id]);
    assert.deepEqual(rows[0], { company_id: COMPANY_A, role: "inspector" });
    const auth = await admin.auth.admin.getUserById(inspA.id);
    assert.equal(auth.data.user.app_metadata.role, "inspector");
    return `${inspA.email}`;
  });

  await check("2. el inspector aparece en el Catálogo de A y no en el de B", async () => {
    const listA = await call("/api/usuarios", { headers: clientHeaders(adminA) });
    const listB = await call("/api/usuarios", { headers: clientHeaders(adminB) });
    assert.equal(listA.status, 200); assert.equal(listB.status, 200);
    assert.ok(listA.body.data.some((u) => u.id === inspA.id && u.perfilPrincipal === "inspector"));
    assert.ok(!listB.body.data.some((u) => u.id === inspA.id));
  });

  await check("3. el administrador B no puede ver, editar, desactivar ni eliminar al inspector de A (404)", async () => {
    assert.equal((await call(`/api/usuarios/${inspA.id}`, { headers: clientHeaders(adminB) })).status, 404);
    assert.equal((await call(`/api/usuarios/${inspA.id}`, { method: "PATCH", headers: clientHeaders(adminB), body: { estado: "inactive" } })).status, 404);
    assert.equal((await call(`/api/usuarios/${inspA.id}`, { method: "DELETE", headers: clientHeaders(adminB) })).status, 404);
  });

  await check("4. el administrador A edita nombre y teléfono del inspector", async () => {
    const res = await call(`/api/usuarios/${inspA.id}`, { method: "PATCH", headers: clientHeaders(adminA), body: { nombreCompleto: "Inspector A Editado", telefono: "+56900000123" } });
    assert.equal(res.status, 200, res.body.error);
    assert.equal(res.body.data.user.nombreCompleto, "Inspector A Editado");
  });

  await check("5. asignar estacionamientos a un inspector se rechaza (400)", async () => {
    const res = await call(`/api/usuarios/${inspA.id}`, { method: "PATCH", headers: clientHeaders(adminA), body: { parkingIds: [PARKING_A] } });
    assert.equal(res.status, 400);
  });

  await check("6. el inspector A inicia sesión y ve solo los estacionamientos On Street de su empresa", async () => {
    tokenA = await signIn(inspA.email, inspA.password);
    const res = await call("/api/inspector/context", { headers: inspectorHeaders(tokenA) });
    assert.equal(res.status, 200, res.body.error);
    const ids = res.body.data.parkings.map((p) => p.id);
    assert.ok(ids.includes(PARKING_A), "incluye el On Street de su empresa");
    assert.ok(!ids.includes(PARKING_B), "no incluye el On Street de otra empresa");
    return `${ids.length} estacionamiento(s)`;
  });

  await check("7. el inspector A ve la sesión vencida de su empresa (VENCIDO, u OBSERVADO si ya se fiscalizó)", async () => {
    const res = await call(`/api/inspector/plates/${PLATE_A_EXPIRED}`, { headers: inspectorHeaders(tokenA) });
    assert.equal(res.status, 200, res.body.error);
    assert.ok(["VENCIDO", "OBSERVADO"].includes(res.body.data.status), res.body.data.status);
    assert.ok(res.body.data.location, "trae la ubicación de la sesión de su empresa");
    return res.body.data.status;
  });

  await check("8. un inspector de B no ve la sesión de A ni sus fiscalizaciones", async () => {
    inspB = await createInspector(adminB, "b");
    tokenB = await signIn(inspB.email, inspB.password);
    const plate = await call(`/api/inspector/plates/${PLATE_A_EXPIRED}`, { headers: inspectorHeaders(tokenB) });
    assert.equal(plate.status, 200, plate.body.error);
    assert.notEqual(plate.body.data.status, "VENCIDO");
    assert.equal(plate.body.data.sessionId ?? null, null, "sin sesión de otra empresa");
    const observed = await call("/api/inspector/observed", { headers: inspectorHeaders(tokenB) });
    assert.equal(observed.status, 200);
    const { rows } = await sql.query("select distinct license_plate_normalized from on_street_inspections where parking_id = $1", [PARKING_A]);
    const plateSetA = new Set(rows.map((r) => r.license_plate_normalized));
    assert.ok(!observed.body.data.some((r) => plateSetA.has(r.license_plate_normalized) && !r.fromB), "no lista patentes fiscalizadas en A");
    const contextB = await call("/api/inspector/context", { headers: inspectorHeaders(tokenB) });
    assert.ok(!contextB.body.data.parkings.some((p) => p.id === PARKING_A));
    return `estado para B: ${plate.body.data.status}`;
  });

  await check("9. una fiscalización con contexto de otra empresa no queda atribuida a esa empresa", async () => {
    const res = await fetch(`${appUrl}/api/inspector/inspections`, { method: "POST", headers: { ...inspectorHeaders(tokenB), "idempotency-key": `e2e-${tag}-cross` }, body: JSON.stringify({ plate: "ZZZZ99", inspectionType: "NO_SESSION", contextParkingId: PARKING_A }) });
    const body = await res.json();
    assert.equal(res.status, 201, body.error);
    const { rows } = await sql.query("select parking_id, inspector_user_id from on_street_inspections where id = $1", [body.data.id]);
    assert.equal(rows[0].parking_id, null, "el estacionamiento de A se descarta");
    assert.equal(rows[0].inspector_user_id, inspB.id);
  });

  await check("10. eliminar un inspector con fiscalizaciones se rechaza (409) y pide desactivarlo", async () => {
    const res = await call(`/api/usuarios/${inspB.id}`, { method: "DELETE", headers: clientHeaders(adminB) });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "INSPECTOR_HAS_INSPECTIONS");
  });

  await check("11. desactivado en el Catálogo, el inspector B ya no puede usar la API (403); reactivado vuelve", async () => {
    assert.equal((await call(`/api/usuarios/${inspB.id}`, { method: "PATCH", headers: clientHeaders(adminB), body: { estado: "inactive" } })).status, 200);
    assert.equal((await call("/api/inspector/context", { headers: inspectorHeaders(tokenB) })).status, 403);
    assert.equal((await call(`/api/usuarios/${inspB.id}`, { method: "PATCH", headers: clientHeaders(adminB), body: { estado: "active" } })).status, 200);
    assert.equal((await call("/api/inspector/context", { headers: inspectorHeaders(tokenB) })).status, 200);
  });

  await check("12. eliminar un inspector sin fiscalizaciones borra su cuenta y su membresía", async () => {
    const res = await call(`/api/usuarios/${inspA.id}`, { method: "DELETE", headers: clientHeaders(adminA) });
    assert.equal(res.status, 200, res.body.error);
    const { rows } = await sql.query("select 1 from company_members where user_id = $1", [inspA.id]);
    assert.equal(rows.length, 0);
    const auth = await admin.auth.admin.getUserById(inspA.id);
    assert.ok(auth.error || !auth.data?.user, "la cuenta ya no existe");
  });

  await check("13. eliminar un operador por esta vía se rechaza (400)", async () => {
    const { rows } = await sql.query("select user_id from company_members where company_id = $1 and role = 'company_admin' limit 1", [COMPANY_A]);
    const res = await call(`/api/usuarios/${rows[0].user_id}`, { method: "DELETE", headers: clientHeaders(adminA) });
    assert.ok([400].includes(res.status), `status ${res.status}`);
  });

  await check("14. On Street › Inspectores: el administrador B solo ve sus inspectores; crear ahí responde 410", async () => {
    const list = await call("/api/on-street-qr/inspectores", { headers: clientHeaders(adminB) });
    if (list.status === 403) return "omitido: emp-5q no tiene On Street habilitado como producto";
    assert.equal(list.status, 200, list.body.error);
    assert.ok(list.body.data.every((i) => i.companyId === COMPANY_B));
    assert.equal((await call("/api/on-street-qr/inspectores", { method: "POST", headers: clientHeaders(adminB), body: {} })).status, 410);
  });

  // Limpieza: el inspector B queda desactivado (tiene una fiscalización de prueba).
  await sql.query("update company_members set status = 'inactive' where user_id = $1", [inspB?.id || "00000000-0000-0000-0000-000000000000"]);
} finally {
  await sql.end();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
