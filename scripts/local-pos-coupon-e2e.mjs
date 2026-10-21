// Prueba local de «Leer QR Descuento» en el POS (SOL-2026-10-19-002): base local +
// servidor local (next dev). Datos ficticios propios: estacionamiento «E2E Cupones»
// de Clínica Ramis, un operador de prueba creado aquí con clave aleatoria y cupones
// de prueba. Llama a las mismas rutas que el POS (/api/pos/shift/start,
// /api/data-entry, /api/pos/stays/[id]/quote) con la sesión del operador.
//
// Uso: node --env-file=.env.local scripts/local-pos-coupon-e2e.mjs
//      (LOCAL_APP_URL=http://127.0.0.1:3080 por defecto)
// Nunca imprime la clave, el token de sesión ni el token completo de un cupón.

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)) throw new Error("Solo base local.");
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3080";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(appUrl)) throw new Error("Solo servidor local.");

const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = new pg.Client({ host: "127.0.0.1", port: Number(process.env.LOCAL_DB_PORT || 6543), user: "postgres", password: "postgres", database: "postgres" });

const COMPANY = "emp-ramis";
const OTHER_COMPANY = "emp-5q";
const PARKING = "ecc00000-0000-4000-8000-000000000001";
const RATE = "ecc00000-0000-4000-8000-0000000000a1";
const OPERATOR_EMAIL = "e2e.cupones.operador@parkfacil.test";
const MINUTE_AMOUNT = 20;
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail || "");
  } catch (error) {
    record(name, false, error?.message || String(error));
  }
}

const shortCode = () => Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join("");
const masked = (token) => `${String(token).slice(0, 8)}…`;

async function fixture() {
  await sql.query(`insert into parkings (id, company_id, code, name, type, status, address, city)
    values ($1, $2, 'E2E-CUP', 'E2E Cupones (local)', 'OFF_STREET', 'ACTIVE', 'Calle Ficticia 123', 'Santiago')
    on conflict (id) do update set status = 'ACTIVE'`, [PARKING, COMPANY]);
  await sql.query(`insert into parking_rates (id, parking_id, name, billing_mode, currency, minute_amount, free_period_seconds, valid_from, status)
    values ($1, $2, 'Tarifa E2E Cupones', 'EFFECTIVE_MINUTE', 'CLP', $3, 0, '2026-01-01T00:00:00Z', 'ACTIVE')
    on conflict (id) do update set status = 'ACTIVE', minute_amount = $3, free_period_seconds = 0, valid_until = null`, [RATE, PARKING, MINUTE_AMOUNT]);

  // Módulo Cupones activo (etapa C) para Ramis y para la empresa "ajena" del caso de otra empresa.
  await ensureCouponModule(COMPANY);
  await ensureCouponModule(OTHER_COMPANY);

  const merchant = await sql.query(`insert into coupon_merchants (company_id, code, name) values ($1, 'E2E-TIENDA', 'Tienda E2E (local)')
    on conflict do nothing returning id`, [COMPANY]);
  const merchantId = merchant.rows[0]?.id || (await sql.query("select id from coupon_merchants where company_id = $1 and code = 'E2E-TIENDA'", [COMPANY])).rows[0].id;

  // Operador de prueba: cuenta nueva y local, clave aleatoria en cada ejecución.
  const password = `E2e-${randomBytes(12).toString("base64url")}!`;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let user = listed.data.users.find((entry) => entry.email === OPERATOR_EMAIL);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email: OPERATOR_EMAIL, password, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, { password });
    if (updated.error) throw updated.error;
  }
  await sql.query(`insert into company_members (user_id, company_id, full_name, role, status, pos_only, must_change_password, product_scope)
    values ($1, $2, 'Operador E2E Cupones', 'operator', 'active', true, false, 'OFF_STREET')
    on conflict (user_id) do update set status = 'active', must_change_password = false`, [user.id, COMPANY]);
  await sql.query("delete from company_member_parkings where user_id = $1", [user.id]);
  await sql.query("insert into company_member_parkings (user_id, parking_id, access_level) values ($1, $2, 'POS_OPERATOR')", [user.id, PARKING]);
  // Estadías abiertas de ejecuciones anteriores: fuera del camino.
  await sql.query("update parking_stays set status = 'CANCELLED' where parking_id = $1 and status = 'OPEN'", [PARKING]).catch(async () => {
    await sql.query("delete from parking_stays where parking_id = $1 and status = 'OPEN'", [PARKING]);
  });

  const session = await anon.auth.signInWithPassword({ email: OPERATOR_EMAIL, password });
  if (session.error) throw session.error;
  return { userId: user.id, token: session.data.session.access_token, merchantId };
}

// Contrato vigente de 12 meses y módulo encendido (solo base local).
async function ensureCouponModule(companyId) {
  const moduleRow = await sql.query("select current_contract_id from coupon_company_modules where company_id = $1", [companyId]);
  let contractId = moduleRow.rows[0]?.current_contract_id || null;
  const contract = contractId ? await sql.query("select starts_at, ends_at from coupon_module_contracts where id = $1", [contractId]) : { rows: [] };
  const active = contract.rows[0] && new Date(contract.rows[0].starts_at) <= new Date() && new Date(contract.rows[0].ends_at) > new Date();
  if (!active) {
    const version = (await sql.query("select coalesce(max(version), 0) + 1 as v from coupon_module_contracts where company_id = $1", [companyId])).rows[0].v;
    contractId = (await sql.query(`insert into coupon_module_contracts (company_id, version, monthly_fee_uf, term_months, starts_at, ends_at, reason)
      values ($1, $2, 0, 12, now() - interval '1 day', coupon_module_contract_end(now() - interval '1 day', 12), 'Prueba local E2E cupones') returning id`, [companyId, version])).rows[0].id;
  }
  await sql.query(`insert into coupon_company_modules (company_id, enabled, current_contract_id, status_reason) values ($1, true, $2, 'Prueba local E2E cupones')
    on conflict (company_id) do update set enabled = true, current_contract_id = $2`, [companyId, contractId]);
}

async function coupon(merchantId, overrides = {}) {
  const row = {
    company_id: COMPANY, merchant_id: merchantId, code: shortCode(), name: "Cupón E2E",
    benefit_type: "PERCENTAGE", benefit_value: 20, status: "ACTIVE",
    valid_from: new Date(Date.now() - 3600_000).toISOString(), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    ...overrides,
  };
  const { rows } = await sql.query(`insert into coupons (company_id, merchant_id, code, name, benefit_type, benefit_value, status, valid_from, expires_at, redeemed_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, code, qr_token`,
  [row.company_id, row.merchant_id, row.code, row.name, row.benefit_type, row.benefit_value, row.status, row.valid_from, row.expires_at, row.redeemed_at || null]);
  return { ...rows[0], qr: `PFC-COUPON:${rows[0].qr_token}` };
}

async function couponRow(id) {
  return (await sql.query("select status, redeemed_at, redeemed_stay_id from coupons where id = $1", [id])).rows[0];
}

function api(token) {
  return async (path, { method = "GET", body } = {}) => {
    const response = await fetch(`${appUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "x-parkfacil-portal": "terminal", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    // data-entry devuelve el código en details.code; la ruta de cálculo, en code.
    if (payload && !payload.code && payload.details?.code) payload.code = payload.details.code;
    return { status: response.status, body: payload };
  };
}

let plateSeq = 0;
function nextPlate() {
  plateSeq += 1;
  const letters = "BCDFGHJKLPRSTVWXYZ";
  const n = Date.now() % 100;
  return `${letters[plateSeq % letters.length]}${letters[(plateSeq + 3) % letters.length]}${letters[(plateSeq + 7) % letters.length]}${letters[(n + plateSeq) % letters.length]}${String((n + plateSeq * 7) % 90 + 10)}`;
}

// Ingreso por la API del POS y entrada adelantada `minutes` (solo base local).
async function openStay(call, minutes) {
  const entry = await call("/api/data-entry", { method: "POST", body: { action: "ENTRY", plate: nextPlate() } });
  assert.equal(entry.status, 201, `ENTRY ${entry.status} ${entry.body?.error || ""}`);
  const stay = entry.body.data.stay;
  await sql.query("update parking_stays set entry_at = now() - ($2 || ' minutes')::interval, updated_at = now() where id = $1", [stay.id, String(minutes)]);
  return stay;
}

const quote = (call, stayId, couponToken) => couponToken
  ? call(`/api/pos/stays/${stayId}/quote`, { method: "POST", body: { couponToken } })
  : call(`/api/pos/stays/${stayId}/quote`);

const cashExit = (call, stayId, snapshot, couponToken) => call("/api/data-entry", {
  method: "POST",
  body: { action: "EXIT", stayId, paymentMethod: "CASH", quoteSnapshot: snapshot, ...(couponToken && snapshot?.couponId ? { couponToken } : {}) },
});

await sql.connect();
try {
  const { token, merchantId, userId } = await fixture();
  const call = api(token);
  // Turno: se reutiliza el abierto de una ejecución anterior; si no, se abre a pedido.
  const openShift = await sql.query("select id from operator_shifts where operator_id = $1 and parking_id = $2 and status = 'OPEN'", [userId, PARKING]);
  if (!openShift.rows.length) {
    const shift = await call("/api/pos/shift/start", { method: "POST", body: { onDemand: true, parkingId: PARKING } });
    assert.ok([200, 201].includes(shift.status), `turno ${shift.status} ${shift.body?.error || ""}`);
  }
  console.log("Fixture listo (estacionamiento E2E-CUP, turno abierto).");

  // 90 minutos a $20 = $1.800.
  await check("Descuento porcentual 20%: subtotal 1800, descuento 360, total 1440; pago en efectivo canjea el cupón", async () => {
    const c = await coupon(merchantId, { benefit_type: "PERCENTAGE", benefit_value: 20 });
    const stay = await openStay(call, 90);
    const q = await quote(call, stay.id, c.qr);
    assert.equal(q.status, 200, q.body?.error);
    const s = q.body.data.quote.snapshot;
    assert.deepEqual([s.subtotalAmount, s.discountAmount, s.totalAmount, s.couponId], [1800, 360, 1440, c.id]);
    assert.equal((await couponRow(c.id)).status, "ACTIVE", "leer no canjea");
    const exit = await cashExit(call, stay.id, s, c.qr);
    assert.equal(exit.status, 200, exit.body?.error);
    const paid = exit.body.data.stay;
    assert.deepEqual([paid.status, paid.subtotal_amount, paid.discount_amount, paid.total_amount, paid.coupon_id, paid.coupon_code, paid.payment_method], ["PAID", 1800, 360, 1440, c.id, c.code, "CASH"]);
    const row = await couponRow(c.id);
    assert.deepEqual([row.status, row.redeemed_stay_id], ["REDEEMED", stay.id]);
    return `cupón ${c.code} (${masked(c.qr_token)}) canjeado en ${paid.code}`;
  });

  await check("Descuento fijo $1.000: total 800", async () => {
    const c = await coupon(merchantId, { benefit_type: "FIXED_AMOUNT", benefit_value: 1000 });
    const stay = await openStay(call, 90);
    const s = (await quote(call, stay.id, c.qr)).body.data.quote.snapshot;
    assert.deepEqual([s.subtotalAmount, s.discountAmount, s.totalAmount], [1800, 1000, 800]);
    const exit = await cashExit(call, stay.id, s, c.qr);
    assert.equal(exit.status, 200, exit.body?.error);
    assert.equal(exit.body.data.stay.total_amount, 800);
  });

  await check("Minutos gratis (15): subtotal 1800, descuento 300, total 1500", async () => {
    const c = await coupon(merchantId, { benefit_type: "FREE_MINUTES", benefit_value: 15 });
    const stay = await openStay(call, 90);
    const s = (await quote(call, stay.id, c.qr)).body.data.quote.snapshot;
    assert.deepEqual([s.subtotalAmount, s.discountAmount, s.totalAmount], [1800, 300, 1500]);
  });

  await check("Total final cero: salida en efectivo $0 con el cupón; tarjeta rechazada sin cobrar", async () => {
    const c = await coupon(merchantId, { benefit_type: "FIXED_AMOUNT", benefit_value: 50000 });
    const stay = await openStay(call, 90);
    const q = await quote(call, stay.id, c.qr);
    assert.equal(q.status, 200, `${q.status} ${q.body?.code} ${q.body?.error}`);
    const s = q.body.data.quote.snapshot;
    assert.deepEqual([s.subtotalAmount, s.discountAmount, s.totalAmount], [1800, 1800, 0]);
    const card = await call("/api/data-entry", { method: "POST", body: { action: "CARD_PAYMENT_RESERVE", stayId: stay.id, quoteSnapshot: s, paymentCardType: "DEBIT", deviceId: "e2e-cupones-device", idempotencyKey: randomUUID(), tuuEnvironment: "DEV" } });
    assert.equal(card.body?.code, "CARD_ATTEMPT_AMOUNT_INVALID", `tarjeta ${card.status} ${card.body?.code || card.body?.error}`);
    const exit = await cashExit(call, stay.id, s, c.qr);
    assert.equal(exit.status, 200, exit.body?.error);
    assert.deepEqual([exit.body.data.stay.total_amount, exit.body.data.stay.discount_amount, Boolean(exit.body.data.boleta)], [0, 1800, false]);
    assert.equal((await couponRow(c.id)).status, "REDEEMED");
    return "sin boleta (total $0)";
  });

  await check("Cupones inválidos: vencido, futuro, inactivo, utilizado, inexistente, de otra empresa y QR del ticket", async () => {
    const stay = await openStay(call, 90);
    const cases = [
      ["vencido", await coupon(merchantId, { expires_at: new Date(Date.now() - 60_000).toISOString() }), "COUPON_EXPIRED"],
      ["futuro", await coupon(merchantId, { valid_from: new Date(Date.now() + 86400_000).toISOString() }), "COUPON_NOT_YET_VALID"],
      ["inactivo", await coupon(merchantId, { status: "CANCELLED" }), "COUPON_INACTIVE"],
      ["utilizado", await coupon(merchantId, { status: "REDEEMED", redeemed_at: new Date().toISOString() }), "COUPON_ALREADY_USED"],
      ["inexistente", { qr: `PFC-COUPON:${randomUUID()}` }, "COUPON_NOT_FOUND"],
      ["otra empresa", { qr: (await sql.query("insert into coupons (company_id, code, name, benefit_type, benefit_value, status, valid_from, expires_at) values ($1, $2, 'Ajeno E2E', 'PERCENTAGE', 50, 'ACTIVE', now() - interval '1 hour', now() + interval '1 day') returning qr_token", [OTHER_COMPANY, shortCode()])).rows[0].qr_token }, "COUPON_WRONG_COMPANY"],
      ["QR del ticket", { qr: `PFC-COUPON:${stay.qr_token}` }, "COUPON_NOT_FOUND"],
    ];
    cases[5][1].qr = `PFC-COUPON:${cases[5][1].qr}`;
    const seen = [];
    for (const [label, c, code] of cases) {
      const q = await quote(call, stay.id, c.qr);
      assert.equal(q.status, 409, `${label}: ${q.status}`);
      assert.equal(q.body.code, code, `${label}: ${q.body.code}`);
      seen.push(`${label}=${q.body.error}`);
    }
    const base = await quote(call, stay.id);
    assert.equal(base.body.data.quote.snapshot.couponId ?? null, null);
    return seen.join(" | ");
  });

  await check("Reemplazar y quitar el cupón antes del pago (no se acumulan)", async () => {
    const a = await coupon(merchantId, { benefit_type: "PERCENTAGE", benefit_value: 10 });
    const b = await coupon(merchantId, { benefit_type: "FIXED_AMOUNT", benefit_value: 500 });
    const stay = await openStay(call, 90);
    const qa = (await quote(call, stay.id, a.qr)).body.data.quote.snapshot;
    const qb = (await quote(call, stay.id, b.qr)).body.data.quote.snapshot;
    assert.deepEqual([qa.couponId, qa.totalAmount, qb.couponId, qb.discountAmount, qb.totalAmount], [a.id, 1620, b.id, 500, 1300]);
    const none = (await quote(call, stay.id)).body.data.quote.snapshot;
    assert.deepEqual([none.couponId ?? null, none.totalAmount], [null, 1800]);
    assert.deepEqual([(await couponRow(a.id)).status, (await couponRow(b.id)).status], ["ACTIVE", "ACTIVE"]);
  });

  await check("Cálculo firmado vencido o alterado: se rechaza y el cupón queda disponible", async () => {
    const c = await coupon(merchantId);
    const stay = await openStay(call, 90);
    const s = (await quote(call, stay.id, c.qr)).body.data.quote.snapshot;
    const expired = await cashExit(call, stay.id, { ...s, expiresAt: new Date(Date.now() - 1000).toISOString() }, c.qr);
    assert.equal(expired.body.code, "QUOTE_SNAPSHOT_EXPIRED");
    const tampered = await cashExit(call, stay.id, { ...s, totalAmount: 1, discountAmount: 1799 }, c.qr);
    assert.equal(tampered.body.code, "QUOTE_SNAPSHOT_INVALID");
    assert.equal((await couponRow(c.id)).status, "ACTIVE");
    // Renovación conservando el cupón (lo que hace el POS al vencer).
    const renewed = (await quote(call, stay.id, c.qr)).body.data.quote.snapshot;
    assert.equal(renewed.couponId, c.id);
    return "importes del dispositivo no aceptados";
  });

  await check("Mismo cupón en dos cobros simultáneos: solo uno lo canjea; el otro no cobra", async () => {
    const c = await coupon(merchantId, { benefit_type: "FIXED_AMOUNT", benefit_value: 300 });
    const s1 = await openStay(call, 90);
    const s2 = await openStay(call, 90);
    const [q1, q2] = await Promise.all([quote(call, s1.id, c.qr), quote(call, s2.id, c.qr)]);
    const [e1, e2] = await Promise.all([
      cashExit(call, s1.id, q1.body.data.quote.snapshot, c.qr),
      cashExit(call, s2.id, q2.body.data.quote.snapshot, c.qr),
    ]);
    const statuses = [e1.status, e2.status].sort();
    assert.deepEqual(statuses, [200, 409], `estados ${e1.status}/${e2.status}`);
    const winner = e1.status === 200 ? s1 : s2;
    const loser = e1.status === 200 ? s2 : s1;
    assert.equal((await couponRow(c.id)).redeemed_stay_id, winner.id);
    const loserRow = (await sql.query("select status, total_amount, coupon_id from parking_stays where id = $1", [loser.id])).rows[0];
    assert.deepEqual([loserRow.status, loserRow.coupon_id], ["OPEN", null]);
    return `respuesta del segundo: ${(e1.status === 409 ? e1 : e2).body.error}`;
  });

  await check("Reintento del mismo cobro: no duplica pago ni canje", async () => {
    const c = await coupon(merchantId, { benefit_type: "FIXED_AMOUNT", benefit_value: 200 });
    const stay = await openStay(call, 90);
    const s = (await quote(call, stay.id, c.qr)).body.data.quote.snapshot;
    const first = await cashExit(call, stay.id, s, c.qr);
    const again = await cashExit(call, stay.id, s, c.qr);
    assert.equal(first.status, 200);
    assert.notEqual(again.status, 200, "el segundo envío no debe registrar otro pago");
    const pays = (await sql.query("select count(*)::int n from parking_stays where id = $1 and status = 'PAID'", [stay.id])).rows[0].n;
    assert.equal(pays, 1);
    return `segundo envío ${again.status}: ${again.body.error}`;
  });

  await check("Tarjeta con cupón ya utilizado: no se reserva el cobro", async () => {
    const c = await coupon(merchantId, { benefit_type: "FIXED_AMOUNT", benefit_value: 100 });
    const stay = await openStay(call, 90);
    const s = (await quote(call, stay.id, c.qr)).body.data.quote.snapshot;
    await sql.query("update coupons set status = 'REDEEMED', redeemed_at = now() where id = $1", [c.id]);
    const card = await call("/api/data-entry", { method: "POST", body: { action: "CARD_PAYMENT_RESERVE", stayId: stay.id, quoteSnapshot: s, paymentCardType: "DEBIT", deviceId: "e2e-cupones-device", idempotencyKey: randomUUID(), tuuEnvironment: "DEV" } });
    assert.equal(card.body?.code, "COUPON_UNAVAILABLE", `${card.status} ${card.body?.code || card.body?.error}`);
    const attempts = (await sql.query("select count(*)::int n from pos_card_payment_attempts where stay_id = $1", [stay.id])).rows[0].n;
    assert.equal(attempts, 0);
  });

  await check("Cobro normal sin cupón: sin regresiones", async () => {
    const stay = await openStay(call, 90);
    const s = (await quote(call, stay.id)).body.data.quote.snapshot;
    assert.deepEqual([s.totalAmount, s.couponId ?? null], [1800, null]);
    const exit = await cashExit(call, stay.id, s);
    assert.equal(exit.status, 200, exit.body?.error);
    const paid = exit.body.data.stay;
    assert.deepEqual([paid.total_amount, paid.coupon_id, paid.discount_amount], [1800, null, 0]);
  });
} finally {
  await sql.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} casos OK`);
if (failed.length) process.exitCode = 1;
