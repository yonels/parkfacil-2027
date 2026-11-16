// Prueba local del total recaudado del mes en Reportes Off Street › Recaudación
// (SOL-2026-10-27-002): base local + `next dev` local (Portal Cliente en cliente.localhost).
// Crea/actualiza administradores de prueba de Inmobiliaria 5Q y Clínica Ramis y compara
// /api/recaudacion/total-mes con la suma del detalle /api/recaudacion?all=true del mes.
// No modifica estadías ni pagos.
//
// Uso: node --env-file=.env.local scripts/local-recaudacion-total-mes-e2e.mjs
//      (LOCAL_APP_URL=http://127.0.0.1:3120 y LOCAL_DB_PORT=6543 por defecto)
// La contraseña del administrador 5Q queda en .env.recaudacion-test.local (ignorado por Git)
// para la verificación en navegador. Nunca imprime claves ni tokens de sesión.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) throw new Error("Solo base local.");
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3120";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(appUrl)) throw new Error("Solo servidor local.");
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const sql = new pg.Client({ host: "127.0.0.1", port: Number(process.env.LOCAL_DB_PORT || 6543), user: "postgres", password: "postgres", database: "postgres" });

const MONTH = process.env.TOTAL_MONTH || "2026-10";
const LAST_DAY = new Date(Date.UTC(Number(MONTH.slice(0, 4)), Number(MONTH.slice(5, 7)), 0)).getUTCDate();
const results = [];
async function check(name, fn) {
  try { const detail = await fn(); results.push(true); console.log(`OK    ${name}${detail ? ` — ${detail}` : ""}`); }
  catch (error) { results.push(false); console.log(`FALLA ${name} — ${error.message}`); }
}

async function ensureUser(email, companyId) {
  const password = `Rec-${randomBytes(12).toString("base64url")}!`;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = listed.data.users.find((u) => u.email === email);
  if (!user) user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
  else await admin.auth.admin.updateUserById(user.id, { password });
  await sql.query(`insert into company_members (user_id, company_id, full_name, role, status, pos_only, must_change_password, product_scope)
    values ($1, $2, $3, 'company_admin', 'active', false, false, 'OFF_STREET')
    on conflict (user_id) do update set company_id = $2, role = 'company_admin', status = 'active', must_change_password = false`,
  [user.id, companyId, "Prueba recaudación"]);
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { token: session.data.session.access_token, password };
}

function api(token) {
  return async (path) => {
    const response = await fetch(`${appUrl}${path}`, { headers: { authorization: `Bearer ${token}`, "x-forwarded-host": "cliente.localhost" } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
}

// Suma esperada directa en la base (PAID, Off Street, mes en hora de Chile).
async function dbTotal(companyId, parkingId = null) {
  const { rows } = await sql.query(`select coalesce(sum(s.total_amount), 0)::bigint total, count(*)::int n
    from parking_stays s join parkings p on p.id = s.parking_id
    where s.status = 'PAID' and p.type = 'OFF_STREET' and p.company_id = $1 and ($2::uuid is null or p.id = $2::uuid)
      and to_char(s.exit_at at time zone 'America/Santiago', 'YYYY-MM') = $3`, [companyId, parkingId, MONTH]);
  return { total: Number(rows[0].total), count: rows[0].n };
}

await sql.connect();
try {
  const { token: token5q, password } = await ensureUser("recaudacion.admin5q@parkfacil.test", "emp-5q");
  const { token: tokenRamis } = await ensureUser("recaudacion.adminramis@parkfacil.test", "emp-ramis");
  await writeFile(".env.recaudacion-test.local", `RECAUDACION_TEST_EMAIL=recaudacion.admin5q@parkfacil.test\nRECAUDACION_TEST_PASSWORD=${password}\n`);
  const as5q = api(token5q);
  const asRamis = api(tokenRamis);

  await check(`5Q: total del mes ${MONTH} = suma del detalle del mes = suma en base`, async () => {
    const total = await as5q(`/api/recaudacion/total-mes?month=${MONTH}`);
    assert.equal(total.status, 200);
    const detail = await as5q(`/api/recaudacion?all=true&dateFrom=${MONTH}-01&dateTo=${MONTH}-${LAST_DAY}`);
    assert.equal(detail.status, 200);
    const detailSum = detail.body.data.rows.reduce((sum, row) => sum + row.amount, 0);
    const expected = await dbTotal("emp-5q");
    assert.equal(total.body.data.totalAmount, detailSum);
    assert.equal(total.body.data.totalAmount, expected.total);
    assert.equal(total.body.data.count, detail.body.data.rows.length);
    return `$${total.body.data.totalAmount} en ${total.body.data.count} pagos`;
  });

  await check("5Q: por estacionamiento, el total coincide con la base", async () => {
    const { rows } = await sql.query("select id from parkings where company_id = 'emp-5q' and type = 'OFF_STREET'");
    for (const { id } of rows) {
      const total = await as5q(`/api/recaudacion/total-mes?month=${MONTH}&parkingId=${id}`);
      assert.equal(total.status, 200);
      assert.equal(total.body.data.totalAmount, (await dbTotal("emp-5q", id)).total);
    }
    return `${rows.length} estacionamientos`;
  });

  await check("Ramis: su total no incluye 5Q y coincide con la base", async () => {
    const total = await asRamis(`/api/recaudacion/total-mes?month=${MONTH}`);
    assert.equal(total.status, 200);
    assert.equal(total.body.data.totalAmount, (await dbTotal("emp-ramis")).total);
    return `$${total.body.data.totalAmount}`;
  });

  await check("AISLAMIENTO: Ramis no puede pedir un estacionamiento de 5Q ni la empresa 5Q", async () => {
    const { rows } = await sql.query("select id from parkings where company_id = 'emp-5q' and type = 'OFF_STREET' limit 1");
    const byParking = await asRamis(`/api/recaudacion/total-mes?month=${MONTH}&parkingId=${rows[0].id}`);
    assert.equal(byParking.status, 404);
    const byCompany = await asRamis(`/api/recaudacion/total-mes?month=${MONTH}&companyId=emp-5q`);
    assert.equal(byCompany.status, 200);
    assert.equal(byCompany.body.data.totalAmount, 0);
  });

  await check("Sin sesión: 401; mes inválido: 400", async () => {
    const anonymous = await fetch(`${appUrl}/api/recaudacion/total-mes`, { headers: { "x-forwarded-host": "cliente.localhost" } });
    assert.equal(anonymous.status, 401);
    const invalid = await as5q("/api/recaudacion/total-mes?month=2026-13");
    assert.equal(invalid.status, 400);
  });
} finally {
  await sql.end();
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} comprobaciones correctas`);
if (passed !== results.length) process.exitCode = 1;
