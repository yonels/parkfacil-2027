// E2E LOCAL de Pago liberado gestionado por el cliente (SOL-2026-10-28-003).
// Solo contra la base local (127.0.0.1) y el servidor de desarrollo local.
// Uso: LOCAL_SUPABASE_SERVICE_KEY=… LOCAL_APP_URL=http://127.0.0.1:3060 node scripts/local-released-plates-e2e.mjs
// Usuarios de prueba propios (emp-5q, estacionamiento QA-PL-001); la contraseña
// se genera en cada ejecución y no se guarda.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const apiUrl = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3060";
assert(serviceKey, "LOCAL_SUPABASE_SERVICE_KEY es requerida");
assert(/^http:\/\/(127\.0\.0\.1|localhost)/.test(apiUrl) && /^http:\/\/(127\.0\.0\.1|localhost|[a-z]+\.localhost)/.test(appUrl), "Solo local");
const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = new pg.Client({ connectionString: process.env.LOCAL_DB_URL || "postgresql://postgres:postgres@127.0.0.1:6543/postgres" });
await sql.connect();

const COMPANY = "emp-5q";
const PARKING_CODE = "QA-PL-001";
const password = `Local-${randomBytes(9).toString("base64url")}!9a`;
const out = { checks: {} };
const check = (name, value) => { out.checks[name] = value; };
// JPEG mínimo válido (1×1) para la foto obligatoria de la patente liberada.
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
const letters = () => Array.from({ length: 4 }, () => "BCDFGHJKLPRSTVWXYZ"[Math.floor(Math.random() * 18)]).join("");

async function user(email, role, parkingId) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let found = listed.data.users.find((item) => item.email === email);
  if (!found) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    found = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(found.id, { password });
    if (updated.error) throw updated.error;
  }
  const member = await admin.from("company_members").upsert({ user_id: found.id, company_id: COMPANY, full_name: email, role, status: "active", pos_only: role === "operator", must_change_password: false }, { onConflict: "user_id" });
  if (member.error) throw member.error;
  if (parkingId) {
    const assignment = await admin.from("company_member_parkings").upsert({ user_id: found.id, parking_id: parkingId, access_level: "POS_OPERATOR" });
    if (assignment.error) throw assignment.error;
  }
  // Cliente aparte: iniciar sesión en `admin` lo dejaría actuando como el usuario.
  const login = await createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: found.id, token: login.data.session.access_token };
}

async function call(token, path, { method = "GET", body, terminal = false } = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(terminal ? { "x-parkfacil-portal": "terminal" } : { "x-forwarded-host": "cliente.localhost" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const toLocal = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

try {
  const parking = (await sql.query("select id from public.parkings where code=$1", [PARKING_CODE])).rows[0];
  assert(parking, "Falta el estacionamiento QA-PL-001");
  const adminUser = await user("pl.cliente.admin@parkfacil.test", "company_admin");
  const operator = await user("pl.cliente.op@parkfacil.test", "operator", parking.id);

  // Turno abierto del operador.
  await sql.query("update public.operator_shifts set status='CLOSED', closed_at=now() where operator_id=$1 and status='OPEN'", [operator.id]).catch(() => {});
  // Turno a pedido en QA-PL-001 (la empresa tiene varios Off Street).
  const started = await call(operator.token, "/api/pos/shift/start", { method: "POST", body: { onDemand: true, parkingId: parking.id }, terminal: true });
  assert.equal(started.status, 200, JSON.stringify(started.body));

  // Administrador: activación y alta.
  const list0 = await call(adminUser.token, "/api/pago-liberado/patentes");
  assert.equal(list0.status, 200, JSON.stringify(list0.body));
  check("listaParkings", list0.body.data.parkings.length);
  const enable = await call(adminUser.token, "/api/pago-liberado/patentes/estacionamientos", { method: "POST", body: { parkingId: parking.id, enabled: true } });
  assert.equal(enable.status, 200); check("activar", enable.body.data.enabled);

  const plate = `${letters()}${String(Math.floor(Math.random() * 90) + 10)}`;
  const now = Date.now();
  const form = {
    plate, validFrom: toLocal(now - 60000), validTo: toLocal(now + 3 * 3600000 - 60000), durationQuantity: 3, durationUnit: "HOUR",
    beneficiaryName: "Prueba E2E", beneficiaryRut: "12.345.678-5", beneficiaryPhone: "912345678", beneficiaryEmail: "e2e@prueba.cl",
    reason: "E2E local", modality: "THIRD_PARTY", thirdPartyName: "Convenio E2E SpA", thirdPartyRut: "76.123.456-0", thirdPartyEmail: "f@conv.cl",
    thirdPartyAmount: "2,5", thirdPartyCurrency: "UF", usageMode: "MAX", maxUses: 2,
  };
  const incomplete = await call(adminUser.token, "/api/pago-liberado/patentes", { method: "POST", body: { ...form, beneficiaryName: "" } });
  check("sinNombre400", incomplete.status);
  const created = await call(adminUser.token, "/api/pago-liberado/patentes", { method: "POST", body: form });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const auth = created.body.data;
  check("alta", `${auth.displayPlate} ${auth.thirdParty.currency} ${auth.thirdParty.amount}`);
  const dup = await call(adminUser.token, "/api/pago-liberado/patentes", { method: "POST", body: form });
  check("duplicada409", `${dup.status} ${dup.body?.code}`);

  // Estadía abierta de la misma patente en otra empresa: no debe bloquear (20261029130000).
  const formatted = `${plate.slice(0, 4)}-${plate.slice(4)}`;
  await sql.query(`insert into public.parking_stays (code, parking_id, license_plate, entry_source, entry_operator_name)
    values ($1, '10000000-0000-4000-8000-000000000101', $2, 'WEB', 'E2E otra empresa')`, [`E2E-OTRA-${plate}`, formatted]);

  // POS: validación, ingreso, reingreso, cotización y salida.
  const releasedCheck = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "RELEASED_CHECK", plate }, terminal: true });
  check("validacion", `${releasedCheck.body.data.released} · ${releasedCheck.body.data.ticket?.label}`);
  const entry = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "ENTRY", plate, expectReleased: true, platePhotoBase64: PHOTO }, terminal: true });
  assert.equal(entry.status, 201, JSON.stringify(entry.body));
  check("ingreso", `${entry.body.data.releasedPayment.label} · ${entry.body.data.releasedPayment.detail}`);
  check("otraEmpresaNoBloquea", `ingreso ${entry.status} con estadía abierta en otra empresa`);
  const checkInside = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "RELEASED_CHECK", plate }, terminal: true });
  check("validacionYaDentro", `${checkInside.body.data.decision} · ${checkInside.body.data.message}`);
  const again = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "ENTRY", plate, expectReleased: true, platePhotoBase64: PHOTO }, terminal: true });
  check("reingreso409", `${again.status} ${again.body?.details?.code || again.body?.code}`);
  const quote = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "QUOTE", stayId: entry.body.data.stay.id }, terminal: true });
  check("cotizacion", `${quote.status} total=${quote.body?.data?.quote?.total} bloqueo=${quote.body?.data?.quote?.reason || "-"}`);
  const exit = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "RELEASED_EXIT", stayId: entry.body.data.stay.id }, terminal: true });
  check("salidaLiberada", `${exit.status} total=${exit.body?.data?.stay?.total_amount}`);

  // Segundo uso con excedente: se simula que el término fue hace 30 min.
  const entry2 = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "ENTRY", plate, expectReleased: true, platePhotoBase64: PHOTO }, terminal: true });
  assert.equal(entry2.status, 201, JSON.stringify(entry2.body));
  const stayId = entry2.body.data.stay.id;
  await sql.query(`update public.parking_stays set entry_at = now() - interval '2 hours',
    released_plate_snapshot = jsonb_set(jsonb_set(released_plate_snapshot, '{authorizations,0,validTo}', to_jsonb(to_char((now() - interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
      '{authorizations,0,validFrom}', to_jsonb(to_char((now() - interval '3 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) where id=$1`, [stayId]);
  const quote2 = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "QUOTE", stayId }, terminal: true });
  check("excedente", `${quote2.status} ${quote2.body?.error || ""} total=${quote2.body?.data?.quote?.total} cubiertos=${quote2.body?.data?.quote?.released?.coveredMinutes}min cobrables=${quote2.body?.data?.quote?.released?.chargeableMinutes}min`);
  await sql.query("update public.parking_stays set status='CANCELLED' where id=$1", [stayId]);
  const third = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "RELEASED_CHECK", plate }, terminal: true });
  check("usosAgotados", `${third.body.data.decision}`);

  // Administrador: detalle, finalizar, eliminar, restaurar e importación.
  const detail = await call(adminUser.token, `/api/pago-liberado/patentes/${auth.id}`);
  check("historial", detail.body.data.events.map((e) => e.type).join(","));
  const plate2 = `${letters()}${String(Math.floor(Math.random() * 90) + 10)}`;
  const second = await call(adminUser.token, "/api/pago-liberado/patentes", { method: "POST", body: { ...form, plate: plate2, modality: "FREE", usageMode: "MULTIPLE" } });
  const finished = await call(adminUser.token, `/api/pago-liberado/patentes/${second.body.data.id}`, { method: "PATCH", body: { accion: "finalizar", expectedUpdatedAt: second.body.data.updatedAt } });
  check("finalizar", `${finished.status} ${finished.body?.data?.status}`);
  const stale = await call(adminUser.token, `/api/pago-liberado/patentes/${second.body.data.id}`, { method: "PATCH", body: { accion: "eliminar", expectedUpdatedAt: second.body.data.updatedAt } });
  check("concurrencia409", `${stale.status} ${stale.body?.code}`);
  const deleted = await call(adminUser.token, `/api/pago-liberado/patentes/${second.body.data.id}`, { method: "PATCH", body: { accion: "eliminar", expectedUpdatedAt: finished.body.data.updatedAt } });
  const restored = await call(adminUser.token, `/api/pago-liberado/patentes/${second.body.data.id}`, { method: "PATCH", body: { accion: "restaurar", expectedUpdatedAt: deleted.body.data.updatedAt } });
  check("eliminarRestaurar", `${deleted.body?.data?.status} → ${restored.body?.data?.status}`);
  const plate3 = `${letters()}${String(Math.floor(Math.random() * 90) + 10)}`;
  const rows = [
    [plate3, "01-11-2026 08:00", "30-11-2026 20:00", "Importada", "12.345.678-5", "+56 9 1234 5678", "i@c.cl", "Convenio", "maximo", "10"],
    [plate, "01-11-2026 08:00", "02-11-2026 08:00", "X", "12.345.678-9", "+56 9 1234 5678", "x@c.cl", "Y", "", ""],
  ];
  const dry = await call(adminUser.token, "/api/pago-liberado/patentes/importar", { method: "POST", body: { rows, dryRun: true } });
  check("importarValidacion", dry.body.data.results.map((r) => r.error || "OK").join(" | "));
  const imported = await call(adminUser.token, "/api/pago-liberado/patentes/importar", { method: "POST", body: { rows } });
  check("importar", `${imported.status} creadas=${imported.body?.data?.created} rechazadas=${imported.body?.data?.rejected?.length}`);

  // Módulo desactivado: el POS cobra normal.
  await call(adminUser.token, "/api/pago-liberado/patentes/estacionamientos", { method: "POST", body: { parkingId: parking.id, enabled: false } });
  const off = await call(operator.token, "/api/data-entry", { method: "POST", body: { action: "RELEASED_CHECK", plate: plate3 }, terminal: true });
  check("moduloDesactivado", off.body.data.decision);
  await call(adminUser.token, "/api/pago-liberado/patentes/estacionamientos", { method: "POST", body: { parkingId: parking.id, enabled: true } });

  await sql.query("update public.parking_stays set status='CANCELLED' where code like 'E2E-OTRA-%' and status='OPEN'");

  // Un operador no gestiona patentes.
  const forbidden = await call(operator.token, "/api/pago-liberado/patentes");
  check("operador403", forbidden.status);
  console.log(JSON.stringify(out, null, 2));
} catch (error) {
  console.log(JSON.stringify(out, null, 2));
  throw error;
} finally {
  await sql.end();
}
