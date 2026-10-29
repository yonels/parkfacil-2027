// E2E LOCAL de reglas de turnos (SOL-2026-10-29-006). Solo contra la base local
// (127.0.0.1) y el servidor de desarrollo local; deja las reglas en «como hoy»
// y borra los turnos de prueba al terminar.
// Uso: LOCAL_SUPABASE_SERVICE_KEY=… LOCAL_APP_URL=http://127.0.0.1:3060 node scripts/local-shift-rules-e2e.mjs
// Usuarios de prueba propios (emp-5q, QA-PL-001); contraseña nueva en cada
// ejecución, no se guarda.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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
const checks = {};
const check = (name, actual, expected) => { checks[name] = actual === expected ? "OK" : `FALLA (esperado ${expected}, obtenido ${actual})`; };
const createdShiftIds = [];

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
  const member = await admin.from("company_members").upsert({ user_id: found.id, company_id: COMPANY, full_name: email, role, status: "active", pos_only: role === "operator", must_change_password: false });
  if (member.error) throw member.error;
  if (parkingId) {
    const assignment = await admin.from("company_member_parkings").upsert({ user_id: found.id, parking_id: parkingId, access_level: "POS_OPERATOR" });
    if (assignment.error) throw assignment.error;
  }
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

const chile = (ms) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
const dateOf = (ms) => { const p = chile(ms); return `${p.year}-${p.month}-${p.day}`; };
const timeOf = (ms) => { const p = chile(ms); return `${p.hour}:${p.minute}`; };

let parking;
try {
  parking = (await sql.query("select id from public.parkings where code=$1", [PARKING_CODE])).rows[0];
  assert(parking, "Falta el estacionamiento QA-PL-001");
  const adminUser = await user("pl.cliente.admin@parkfacil.test", "company_admin");
  const operator = await user("pl.cliente.op@parkfacil.test", "operator", parking.id);
  const operator2 = await user("pl.cliente.op2@parkfacil.test", "operator", parking.id);
  const rulesPath = `/api/estacionamientos/${PARKING_CODE}/configuracion/reglas-turnos`;
  const putRules = (rules) => call(adminUser.token, rulesPath, { method: "PUT", body: rules });
  const shiftState = async (who) => (await call(who.token, "/api/pos/shift", { terminal: true })).body?.data;
  // Con varios Off Street la empresa usa el selector: la regla viene en cada opción.
  const selectorRule = async (who) => {
    const data = await shiftState(who);
    if (data?.state !== "PARKING_SELECTION_REQUIRED") return data?.shiftRules?.startCheck || data?.shiftRules?.onDemandCheck;
    return (data.offStreetParkings || []).find((option) => option.parkingId === parking.id)?.ruleCheck;
  };

  await sql.query("update public.operator_shifts set status='CLOSED', closed_at=now() where operator_id = any($1) and status in ('OPEN','PROGRAMMED')", [[operator.id, operator2.id]]);

  // Configuración: valores iniciales, validación y permisos.
  await putRules({ startWindow: "FREE", expiredPolicy: "ALLOW", onDemandPolicy: "ALWAYS" });
  const initial = await call(adminUser.token, rulesPath);
  check("config: GET como hoy", JSON.stringify(initial.body?.data), JSON.stringify({ startWindow: "FREE", expiredPolicy: "ALLOW", onDemandPolicy: "ALWAYS" }));
  check("config: valor inválido 400", (await putRules({ startWindow: "45", expiredPolicy: "BLOCK", onDemandPolicy: "ALWAYS" })).status, 400);
  check("config: operador no puede guardar 403", (await call(operator.token, rulesPath, { method: "PUT", body: { startWindow: "15", expiredPolicy: "BLOCK", onDemandPolicy: "NEVER" } })).status, 403);

  // Turno a pedido del operador y estado normal.
  const started = await call(operator.token, "/api/pos/shift/start", { method: "POST", terminal: true, body: { onDemand: true, parkingId: parking.id } });
  check("inicio a pedido como hoy 200", started.status, 200);
  const shiftId = started.body?.data?.shift?.id;
  createdShiftIds.push(shiftId);
  check("turno vigente: modo OK", (await shiftState(operator))?.shiftRules?.openStatus?.mode, "OK");

  // Regla 4: un turno abierto no cambia de horario desde Editar.
  const shiftRow = (await sql.query("select * from public.operator_shifts where id=$1", [shiftId])).rows[0];
  const patch = await call(adminUser.token, `/api/estacionamientos/${PARKING_CODE}/turnos/${shiftId}`, { method: "PATCH", body: { assignmentId: shiftRow.assignment_id, operatorId: operator.id, date: dateOf(Date.now()), scheduledStart: "15:15", scheduledEnd: "15:30", status: "OPEN", notes: "" } });
  check("regla 4: horario de turno abierto 409", patch.status, 409);

  // Turno vencido (de ayer).
  await sql.query("update public.operator_shifts set shift_date = shift_date - 1 where id=$1", [shiftId]);
  check("vencido + como hoy: modo OK", (await shiftState(operator))?.shiftRules?.openStatus?.mode, "OK");
  await putRules({ startWindow: "FREE", expiredPolicy: "WARN", onDemandPolicy: "ALWAYS" });
  check("vencido + avisar: modo WARN", (await shiftState(operator))?.shiftRules?.openStatus?.mode, "WARN");
  check("avisar: el ingreso no lo bloquea la regla (400 por patente)", (await call(operator.token, "/api/data-entry", { method: "POST", terminal: true, body: { action: "ENTRY", plate: "" } })).status, 400);
  await putRules({ startWindow: "FREE", expiredPolicy: "BLOCK", onDemandPolicy: "ALWAYS" });
  const collectOnly = (await shiftState(operator))?.shiftRules?.openStatus;
  check("exigir cierre sin relevo: COLLECT_ONLY", collectOnly?.mode, "COLLECT_ONLY");
  const entryBlocked = await call(operator.token, "/api/data-entry", { method: "POST", terminal: true, body: { action: "ENTRY", plate: "BCDF12" } });
  check("caso B: ingreso 409 SHIFT_EXPIRED", `${entryBlocked.status} ${entryBlocked.body?.details?.code}`, "409 SHIFT_EXPIRED");
  const exitAllowed = await call(operator.token, "/api/data-entry", { method: "POST", terminal: true, body: { action: "EXIT", stayId: randomUUID(), paymentMethod: "CASH" } });
  check("caso B: cobro no lo bloquea la regla", exitAllowed.status !== 409 || exitAllowed.body?.details?.code !== "SHIFT_EXPIRED", true);

  // Caso A: turno siguiente cuyo horario ya empezó (relevo).
  const now = Date.now();
  const next = randomUUID();
  await sql.query(`insert into public.operator_shifts (id, operator_id, parking_id, sector_id, street_id, assignment_id, shift_date, scheduled_start, scheduled_end, status, notes)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROGRAMMED', 'E2E reglas de turnos')`, [next, operator2.id, parking.id, shiftRow.sector_id, shiftRow.street_id, shiftRow.assignment_id, dateOf(now), timeOf(now - 5 * 60_000), timeOf(now + 60 * 60_000)]);
  createdShiftIds.push(next);
  const closeOnly = (await shiftState(operator))?.shiftRules?.openStatus;
  check("caso A: CLOSE_ONLY", closeOnly?.mode, "CLOSE_ONLY");
  check("caso A: mensaje con el turno siguiente", /tiene el turno siguiente/.test(closeOnly?.message || ""), true);
  const exitBlocked = await call(operator.token, "/api/data-entry", { method: "POST", terminal: true, body: { action: "EXIT", stayId: randomUUID(), paymentMethod: "CASH" } });
  check("caso A: cobro 409 SHIFT_HANDOVER", `${exitBlocked.status} ${exitBlocked.body?.details?.code}`, "409 SHIFT_HANDOVER");
  await sql.query("delete from public.operator_shifts where id=$1", [next]);

  // Regla 1: inicio de turno programado fuera del margen (operador 2).
  await putRules({ startWindow: "15", expiredPolicy: "BLOCK", onDemandPolicy: "ALWAYS" });
  const later = randomUUID();
  await sql.query(`insert into public.operator_shifts (id, operator_id, parking_id, sector_id, street_id, assignment_id, shift_date, scheduled_start, scheduled_end, status, notes)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROGRAMMED', 'E2E reglas de turnos')`, [later, operator2.id, parking.id, shiftRow.sector_id, shiftRow.street_id, shiftRow.assignment_id, dateOf(now), timeOf(now + 60 * 60_000), timeOf(now + 120 * 60_000)]);
  createdShiftIds.push(later);
  check("regla 1: el estado informa que aún no", (await selectorRule(operator2))?.code, "SHIFT_START_TOO_EARLY");
  const early = await call(operator2.token, "/api/pos/shift/start", { method: "POST", terminal: true, body: { onDemand: true, parkingId: parking.id } });
  check("regla 1: iniciar antes del margen 409", `${early.status} ${early.body?.code}`, "409 SHIFT_START_TOO_EARLY");

  // Regla 3: turno a pedido con turno programado ese día / no permitido.
  await putRules({ startWindow: "15", expiredPolicy: "BLOCK", onDemandPolicy: "NO_PROGRAMMED" });
  await sql.query("update public.operator_shifts set scheduled_start=$2, scheduled_end=$3 where id=$1", [later, timeOf(now + 60 * 60_000), timeOf(now + 120 * 60_000)]);
  await sql.query("update public.operator_shifts set status='CANCELLED' where id=$1", [later]);
  check("regla 3: sin programado → a pedido permitido", (await selectorRule(operator2))?.ok, true);
  await putRules({ startWindow: "15", expiredPolicy: "BLOCK", onDemandPolicy: "NEVER" });
  check("regla 3: no permitido (estado)", (await selectorRule(operator2))?.code, "ON_DEMAND_NOT_ALLOWED");
  const never = await call(operator2.token, "/api/pos/shift/start", { method: "POST", terminal: true, body: { onDemand: true, parkingId: parking.id } });
  check("regla 3: no permitido 409", `${never.status} ${never.body?.code}`, "409 ON_DEMAND_NOT_ALLOWED");
} finally {
  // Limpieza: reglas «como hoy», turnos de prueba fuera.
  if (parking) await sql.query("update public.parking_offstreet_settings set shift_start_window='FREE', shift_expired_policy='ALLOW', shift_on_demand_policy='ALWAYS' where parking_id=$1", [parking.id]).catch(() => {});
  for (const id of createdShiftIds.filter(Boolean)) {
    await sql.query("delete from public.operator_shifts where id=$1 and not exists (select 1 from public.parking_stays where entry_shift_id=$1 or payment_shift_id=$1) and not exists (select 1 from public.shift_closures where shift_id=$1)", [id]).catch(() => {});
    await sql.query("update public.operator_shifts set status='CLOSED', closed_at=coalesce(closed_at, now()) where id=$1 and status in ('OPEN','PROGRAMMED')", [id]).catch(() => {});
  }
  await sql.end();
}

const failed = Object.entries(checks).filter(([, value]) => value !== "OK");
console.log(JSON.stringify({ total: Object.keys(checks).length, ok: Object.keys(checks).length - failed.length, checks }, null, 2));
process.exit(failed.length ? 1 : 0);
