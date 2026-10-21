// Prueba local de «Eliminar cupones» (SOL-2026-10-20-002): base local + `next dev` local
// (Portal Cliente en cliente.localhost). Datos ficticios: administradores de prueba de
// Clínica Ramis y de Inmobiliaria 5Q, operador de prueba, cupones, estadías e intentos de
// pago «Auditoría…». Requiere la migración 20261020170000 aplicada en la base local.
//
// Uso: node --env-file=.env.local scripts/local-coupon-delete-e2e.mjs
//      (LOCAL_APP_URL=http://127.0.0.1:3080 y LOCAL_DB_PORT=6543 por defecto)
// Nunca imprime claves ni tokens de sesión.

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) throw new Error("Solo base local.");
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3080";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(appUrl)) throw new Error("Solo servidor local.");
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pgConfig = { host: "127.0.0.1", port: Number(process.env.LOCAL_DB_PORT || 6543), user: "postgres", password: "postgres", database: "postgres" };
const sql = new pg.Client(pgConfig);

const RAMIS = "emp-ramis";
const OTHER = "emp-5q";
const PARKING = "ecc00000-0000-4000-8000-000000000001"; // «E2E Cupones (local)», scripts/local-pos-coupon-e2e.mjs
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const PLATE_LETTERS = "BCDFGHJKLPRSTVWXYZ";
const results = [];
const record = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`); };
async function check(name, fn) { try { record(name, true, (await fn()) || ""); } catch (error) { record(name, false, error.message); } }
const shortCode = () => Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join("");
const plate = () => `${Array.from(randomBytes(4), (b) => PLATE_LETTERS[b % PLATE_LETTERS.length]).join("")}-${10 + (randomBytes(1)[0] % 90)}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureUser(email, companyId, role) {
  const password = `Aud-${randomBytes(12).toString("base64url")}!`;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = listed.data.users.find((u) => u.email === email);
  if (!user) user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user;
  else await admin.auth.admin.updateUserById(user.id, { password });
  await sql.query(`insert into company_members (user_id, company_id, full_name, role, status, pos_only, must_change_password, product_scope)
    values ($1, $2, $3, $4, 'active', $5, false, 'OFF_STREET')
    on conflict (user_id) do update set company_id = $2, role = $4, status = 'active', must_change_password = false`,
  [user.id, companyId, `Auditoría ${role}`, role, role === "operator"]);
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return session.data.session.access_token;
}

async function setModule(companyId, enabled) {
  await sql.query("update coupon_company_modules set enabled = $2 where company_id = $1", [companyId, enabled]);
}

async function coupon(companyId, overrides = {}) {
  const row = { status: "ACTIVE", name: "Auditoría eliminar", ...overrides };
  const { rows } = await sql.query(`insert into coupons (company_id, code, name, benefit_type, benefit_value, status, valid_from, expires_at, redeemed_at, redeemed_stay_id)
    values ($1, $2, $3, 'PERCENTAGE', 10, $4, now() - interval '1 hour', now() + interval '2 days', $5, $6) returning id, code`,
  [companyId, shortCode(), row.name, row.status, row.redeemed_at || null, row.redeemed_stay_id || null]);
  return rows[0];
}
async function stay(couponId = null, { paid = false } = {}) {
  const { rows } = await sql.query(`insert into parking_stays (code, parking_id, license_plate, status, coupon_id, entry_operator_name, discount_amount, exit_at, payment_code, payment_method)
    values ($1, $2, $3, $4, $5, 'Auditoría', $6, $7, $8, $9) returning id`,
  [`AUD-${randomBytes(4).toString("hex")}`, PARKING, plate(), paid ? "PAID" : "OPEN", couponId, paid ? 100 : 0, paid ? new Date().toISOString() : null, paid ? `PAG-AUD-${randomBytes(4).toString("hex")}` : null, paid ? "CASH" : null]);
  return rows[0].id;
}
async function shiftOf() {
  const { rows } = await sql.query("select id, operator_id from operator_shifts where parking_id = $1 and status = 'OPEN' limit 1", [PARKING]);
  if (!rows.length) throw new Error("Falta un turno abierto en E2E-CUP (ejecuta antes scripts/local-pos-coupon-e2e.mjs).");
  return rows[0];
}
// Lo que inserta reserve_pos_card_payment, con el cálculo firmado que lleva el cupón.
async function insertAttempt(client, { stayId, couponId, status = "RESERVED", shift }) {
  return client.query(`insert into pos_card_payment_attempts (idempotency_key, company_id, parking_id, stay_id, ticket_code, license_plate, operator_id, shift_id, device_id, environment, card_type, amount, charge_snapshot, status, reservation_expires_at)
    values ($1, $2, $3, $4, 'AUD', 'AUDT-10', $5, $6, 'auditoria-device', 'DEV', 'DEBIT', 1000, $7, $8, now() + interval '3 minutes') returning id`,
  [`aud-${randomUUID()}`, RAMIS, PARKING, stayId, shift.operator_id, shift.id, JSON.stringify({ couponId, totalAmount: 1000 }), status]);
}
const exists = async (id) => (await sql.query("select count(*)::int n from coupons where id = $1", [id])).rows[0].n === 1;

function api(token) {
  return async (method, path, body, raw) => {
    const response = await fetch(`${appUrl}${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "x-forwarded-host": "cliente.localhost", "content-type": "application/json" },
      ...(raw !== undefined ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
}

await sql.connect();
try {
  const asAdmin = api(await ensureUser("auditoria.cupones.admin@parkfacil.test", RAMIS, "company_admin"));
  const asOther = api(await ensureUser("auditoria.cupones.admin5q@parkfacil.test", OTHER, "company_admin"));
  const asOperator = api(await ensureUser("auditoria.cupones.operador@parkfacil.test", RAMIS, "operator"));
  const asAnon = api(null);
  const del = (as, id, extra = {}) => as("DELETE", "/api/cupones", { id, ...extra });
  const shift = await shiftOf();

  await check("Permisos de la base: sin DELETE directo; solo service_role ejecuta delete_unused_coupon", async () => {
    const { rows } = await sql.query(`select has_table_privilege('service_role','public.coupons','DELETE') tabla,
      has_function_privilege('service_role','public.delete_unused_coupon(uuid,text)','EXECUTE') sr,
      has_function_privilege('authenticated','public.delete_unused_coupon(uuid,text)','EXECUTE') auth,
      has_function_privilege('anon','public.delete_unused_coupon(uuid,text)','EXECUTE') an`);
    assert.deepEqual(rows[0], { tabla: false, sr: true, auth: false, an: false });
  });

  await check("Administrador elimina su cupón sin usar (200); la repetición responde 404", async () => {
    const c = await coupon(RAMIS);
    const first = await del(asAdmin, c.id);
    assert.equal(first.status, 200, `${first.status} ${first.body.error}`);
    assert.equal(await exists(c.id), false);
    const again = await del(asAdmin, c.id);
    assert.deepEqual([again.status, again.body.code], [404, "COUPON_NOT_DELETABLE"]);
  });

  await check("Operador 403, anónimo 401 y otra empresa 404; companyId y rol del cuerpo se ignoran", async () => {
    const c = await coupon(RAMIS);
    const op = await del(asOperator, c.id);
    const an = await del(asAnon, c.id);
    const ot = await del(asOther, c.id, { companyId: RAMIS, role: "platform_admin" });
    assert.deepEqual([op.status, an.status, ot.status], [403, 401, 404]);
    assert.equal(await exists(c.id), true);
  });

  await check("Utilizado (409 COUPON_USED) y asociado a una estadía (409 COUPON_LINKED) se conservan", async () => {
    const used = await coupon(RAMIS, { status: "REDEEMED", redeemed_at: new Date().toISOString(), redeemed_stay_id: await stay() });
    const linked = await coupon(RAMIS);
    await stay(linked.id);
    const u = await del(asAdmin, used.id);
    const l = await del(asAdmin, linked.id);
    assert.deepEqual([u.status, u.body.code, l.status, l.body.code], [409, "COUPON_USED", 409, "COUPON_LINKED"]);
    assert.equal(await exists(used.id) && await exists(linked.id), true);
    return `${u.body.error} | ${l.body.error}`;
  });

  await check("Pago con tarjeta en curso o por resolver: 409 COUPON_PAYMENT_IN_PROGRESS; tras rechazo del pago, se puede eliminar", async () => {
    const c = await coupon(RAMIS);
    const attempt = (await insertAttempt(sql, { stayId: await stay(), couponId: c.id, shift })).rows[0].id;
    const r = await del(asAdmin, c.id);
    assert.deepEqual([r.status, r.body.code], [409, "COUPON_PAYMENT_IN_PROGRESS"]);
    await sql.query("update pos_card_payment_attempts set status = 'DECLINED', result_at = now(), resolution_source = 'TUU_RESULT' where id = $1", [attempt]);
    const after = await del(asAdmin, c.id);
    assert.equal(after.status, 200, `${after.status} ${after.body.error}`);
    return r.body.error;
  });

  await check("Reserva con tarjeta con cupón eliminado o canjeado: la base la rechaza (CARD_ATTEMPT_COUPON_UNAVAILABLE)", async () => {
    const gone = randomUUID();
    const redeemed = await coupon(RAMIS, { status: "REDEEMED", redeemed_at: new Date().toISOString(), redeemed_stay_id: await stay() });
    for (const couponId of [gone, redeemed.id]) {
      await assert.rejects(insertAttempt(sql, { stayId: await stay(), couponId, shift }), /CARD_ATTEMPT_COUPON_UNAVAILABLE/);
    }
    const ok = await coupon(RAMIS);
    assert.ok((await insertAttempt(sql, { stayId: await stay(), couponId: ok.id, shift })).rows[0].id, "cupón activo: reserva normal");
  });

  await check("Competencia reserva/eliminación: la reserva primero bloquea la eliminación y la eliminación primero hace fallar la reserva", async () => {
    const a = new pg.Client(pgConfig);
    const b = new pg.Client(pgConfig);
    await a.connect(); await b.connect();
    try {
      const c1 = await coupon(RAMIS);
      const s1 = await stay();
      await a.query("begin");
      await insertAttempt(a, { stayId: s1, couponId: c1.id, shift });
      const pendingDelete = b.query("select public.delete_unused_coupon($1, $2)", [c1.id, RAMIS]).then(() => "eliminado", (e) => e.message);
      await wait(400);
      await a.query("commit");
      assert.match(await pendingDelete, /COUPON_PAYMENT_IN_PROGRESS/);
      const c2 = await coupon(RAMIS);
      const s2 = await stay();
      await b.query("begin");
      await b.query("select public.delete_unused_coupon($1, $2)", [c2.id, RAMIS]);
      const pendingReserve = insertAttempt(a, { stayId: s2, couponId: c2.id, shift }).then(() => "reservado", (e) => e.message);
      await wait(400);
      await b.query("commit");
      assert.match(await pendingReserve, /CARD_ATTEMPT_COUPON_UNAVAILABLE/);
    } finally { await a.end(); await b.end(); }
  });

  await check("Competencia canje en efectivo/eliminación: en ambos órdenes gana solo uno", async () => {
    const a = new pg.Client(pgConfig);
    const b = new pg.Client(pgConfig);
    await a.connect(); await b.connect();
    try {
      const redeem = (client, id) => client.query("update coupons set status = 'REDEEMED', redeemed_at = now() where id = $1 and status = 'ACTIVE' and redeemed_at is null returning id", [id]);
      const c1 = await coupon(RAMIS);
      await a.query("begin");
      await redeem(a, c1.id);
      const pendingDelete = b.query("select public.delete_unused_coupon($1, $2)", [c1.id, RAMIS]).then(() => "eliminado", (e) => e.message);
      await wait(400);
      await a.query("commit");
      assert.match(await pendingDelete, /COUPON_USED/);
      const c2 = await coupon(RAMIS);
      await b.query("begin");
      await b.query("select public.delete_unused_coupon($1, $2)", [c2.id, RAMIS]);
      const pendingRedeem = redeem(a, c2.id);
      await wait(400);
      await b.query("commit");
      assert.equal((await pendingRedeem).rowCount, 0);
    } finally { await a.end(); await b.end(); }
  });

  await check("ID ausente, malformado y JSON inválido: 400 sin eliminar", async () => {
    const r = await Promise.all([asAdmin("DELETE", "/api/cupones", {}), del(asAdmin, "no-es-uuid"), asAdmin("DELETE", "/api/cupones", undefined, "{no json")]);
    assert.deepEqual(r.map((x) => x.status), [400, 400, 400]);
  });

  await check("Doble clic: dos eliminaciones simultáneas → una 200 y otra 404", async () => {
    const c = await coupon(RAMIS);
    const [x, y] = await Promise.all([del(asAdmin, c.id), del(asAdmin, c.id)]);
    assert.deepEqual([x.status, y.status].sort(), [200, 404]);
  });

  await check("Módulo inactivo = solo lectura: 403 COUPON_MODULE_INACTIVE y el cupón se conserva", async () => {
    const c = await coupon(OTHER);
    await setModule(OTHER, false);
    try {
      const r = await del(asOther, c.id);
      assert.deepEqual([r.status, r.body.code], [403, "COUPON_MODULE_INACTIVE"]);
      assert.equal(await exists(c.id), true);
    } finally { await setModule(OTHER, true); }
  });

  await check("10 cupones, 5 utilizados: se eliminan los 5 libres; los 5 utilizados siguen con su estadía, en el listado y en el resumen", async () => {
    const campaign = `Auditoría 10x5 ${randomBytes(3).toString("hex")}`;
    const used = [];
    const free = [];
    for (let i = 0; i < 5; i += 1) {
      const stayId = await stay(null, { paid: true });
      const u = await coupon(RAMIS, { name: campaign, status: "REDEEMED", redeemed_at: new Date().toISOString(), redeemed_stay_id: stayId });
      await sql.query("update parking_stays set coupon_id = $2, coupon_code = $3 where id = $1", [stayId, u.id, u.code]);
      used.push({ id: u.id, stayId });
      free.push((await coupon(RAMIS, { name: campaign })).id);
    }
    const summary = async () => (await asAdmin("GET", "/api/cupones/resumen?groupBy=campaign")).body.data.rows.find((row) => row.campaign === campaign);
    const before = await summary();
    for (const id of free) assert.equal((await del(asAdmin, id)).status, 200);
    for (const { id } of used) assert.equal((await del(asAdmin, id)).status, 409);
    const kept = (await sql.query("select id, status, redeemed_stay_id from coupons where id = any($1::uuid[])", [used.map((u) => u.id)])).rows;
    assert.equal(kept.length, 5);
    for (const u of used) assert.equal(kept.find((k) => k.id === u.id)?.redeemed_stay_id, u.stayId);
    const linked = (await sql.query("select count(*)::int n from parking_stays where coupon_id = any($1::uuid[])", [used.map((u) => u.id)])).rows[0].n;
    assert.equal(linked, 5, "las estadías siguen vinculadas");
    const listed = (await asAdmin("GET", "/api/cupones")).body.data.map((c) => c.id);
    assert.ok(used.every((u) => listed.includes(u.id)) && free.every((id) => !listed.includes(id)));
    const after = await summary();
    assert.deepEqual([before.issued, before.redeemed, after.issued, after.redeemed, after.discountAmount], [10, 5, 5, 5, before.discountAmount]);
    return `resumen antes: emitidos ${before.issued}, canjeados ${before.redeemed}; después: emitidos ${after.issued}, canjeados ${after.redeemed}, descuento $${after.discountAmount} sin cambio`;
  });

  await check("Crear (POST) y consultar sin regresiones; canManage para el administrador", async () => {
    const merchant = (await sql.query("select id from coupon_merchants where company_id = $1 and status = 'ACTIVE' limit 1", [RAMIS])).rows[0];
    const created = await asAdmin("POST", "/api/cupones", { name: "Auditoría crear", code: shortCode(), benefitType: "FIXED_AMOUNT", value: 500, validFrom: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: "ACTIVE", merchantId: merchant.id, redeemingMerchantId: merchant.id });
    assert.equal(created.status, 201, `${created.status} ${created.body.error}`);
    const listed = await asAdmin("GET", "/api/cupones");
    assert.equal(listed.body.canManage, true);
    assert.ok(listed.body.data.some((c) => c.id === created.body.data.id));
  });
} finally {
  // Limpieza: intentos ficticios resueltos y estadías «AUD-» cerradas, para no bloquear
  // otros E2E del estacionamiento E2E-CUP (una estadía con pago activo no se cierra).
  await sql.query("update pos_card_payment_attempts set status = 'DECLINED', result_at = now(), resolution_source = 'TUU_RESULT' where idempotency_key like 'aud-%' and status in ('RESERVED', 'SENT_TO_TUU')");
  await sql.query("update parking_stays set status = 'CANCELLED' where code like 'AUD-%' and status = 'OPEN'");
  await sql.end();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} casos OK`);
if (failed.length) process.exitCode = 1;
