import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const apiUrl = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_KEY;
const appUrl = process.env.LOCAL_APP_URL || "http://127.0.0.1:3000";
assert(serviceKey, "LOCAL_SUPABASE_SERVICE_KEY es requerida");
const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = new pg.Client({ connectionString: process.env.LOCAL_DB_URL || "postgresql://postgres:postgres@127.0.0.1:6543/postgres" });
await sql.connect();

const email = "operador1.5q@usuarios.parkfacil.cl";
const otherEmail = "operador2.5q@usuarios.parkfacil.cl";
const password = "Local-E2E-5Q-2026!";
const output = { checks: {}, http: {}, evidence: {} };
const one = (data) => Array.isArray(data) ? data[0] : data;
const ok = (value, message) => { assert(value, message); return true; };

async function localUser(userEmail) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let user = listed.data.users.find((item) => item.email === userEmail);
  if (!user) {
    const created = await admin.auth.admin.createUser({ email: userEmail, password, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  return user;
}

async function request(token, path, init = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "x-parkfacil-portal": "terminal", "content-type": "application/json", ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

try {
  const operator = await localUser(email);
  const other = await localUser(otherEmail);
  const parkingResult = await admin.from("parkings").update({ status: "ACTIVE" }).eq("code", "5Q-001").select("*").single();
  if (parkingResult.error) throw parkingResult.error;
  const parking = parkingResult.data;

  for (const [user, userEmail] of [[operator, email], [other, otherEmail]]) {
    const member = await admin.from("company_members").upsert({ user_id: user.id, company_id: parking.company_id, full_name: userEmail, role: "operator", status: "active", pos_only: true, must_change_password: false }).select().single();
    if (member.error) throw member.error;
  }
  const assignment = await admin.from("company_member_parkings").upsert({ user_id: operator.id, parking_id: parking.id, access_level: "POS_OPERATOR" }).select().single();
  if (assignment.error) throw assignment.error;

  await sql.query("delete from public.webpay_stay_quotes where stay_id in (select id from public.parking_stays where code like 'E2E-%')");
  await sql.query("delete from public.parking_stays where code like 'E2E-%'");
  await sql.query("delete from public.parking_stays where entry_shift_id in (select id from public.operator_shifts where notes='LOCAL_POS_E2E') or payment_shift_id in (select id from public.operator_shifts where notes='LOCAL_POS_E2E')");
  await sql.query("delete from public.shift_closures where shift_id in (select id from public.operator_shifts where notes='LOCAL_POS_E2E')").catch(() => {});
  await sql.query("delete from public.operator_shifts where notes='LOCAL_POS_E2E'");
  await sql.query("update public.parking_rates set status='SUSPENDED' where parking_id=$1 and status='ACTIVE'", [parking.id]);
  const rate = await sql.query(`insert into public.parking_rates(parking_id,name,billing_mode,minute_amount,free_period_seconds,valid_from,status,notes)
    values($1,'Tarifa E2E','EFFECTIVE_MINUTE',100,0,now()-interval '1 day','ACTIVE','LOCAL_POS_E2E')
    on conflict do nothing returning id`, [parking.id]);
  if (!rate.rowCount) await sql.query("update public.parking_rates set status='ACTIVE',valid_from=now()-interval '1 day' where parking_id=$1", [parking.id]);

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const shiftRows = await sql.query(`insert into public.operator_shifts(operator_id,parking_id,shift_date,scheduled_start,scheduled_end,status,notes)
    values($1,$2,$3,'00:01','23:59','PROGRAMMED','LOCAL_POS_E2E'),($1,$2,$3,'00:02','23:58','PROGRAMMED','LOCAL_POS_E2E') returning *`, [operator.id, parking.id, date]);
  const shiftId = shiftRows.rows[0].id;

  const login = await admin.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const token = login.data.session.access_token;
  const initial = await request(token, "/api/pos/shift");
  assert.equal(initial.status, 200); assert.equal(initial.body.data.state, "PROGRAMMED");
  output.http.programmed = initial.status;

  const starts = await Promise.all([request(token, "/api/pos/shift/start", { method: "POST", body: JSON.stringify({ shiftId }) }), request(token, "/api/pos/shift/start", { method: "POST", body: JSON.stringify({ shiftId }) })]);
  output.http.concurrentOpen = starts.map((item) => item.status).sort();
  assert.deepEqual(output.http.concurrentOpen, [200, 409]);
  const opened = (await sql.query("select id,status,opened_at,opened_by from public.operator_shifts where id=$1", [shiftId])).rows[0];
  output.checks.opened_at = ok(opened.opened_at, "opened_at faltante");
  output.checks.opened_by = ok(opened.opened_by === operator.id, "opened_by incorrecto");

  const entry = await request(token, "/api/data-entry", { method: "POST", body: JSON.stringify({ action: "ENTRY", plate: "E2E123" }) });
  assert.equal(entry.status, 201, JSON.stringify(entry.body));
  const stayId = entry.body.data.stay.id;
  output.checks.entry_shift_id = ok(entry.body.data.stay.entry_shift_id === shiftId, "entry_shift_id incorrecto");
  await sql.query("update public.parking_stays set entry_at=now()-interval '10 minutes' where id=$1", [stayId]);
  const payment = await request(token, "/api/data-entry", { method: "POST", body: JSON.stringify({ action: "EXIT", stayId, paymentMethod: "CASH" }) });
  assert.equal(payment.status, 200, JSON.stringify(payment.body));
  output.checks.payment_shift_id = ok(payment.body.data.stay.payment_shift_id === shiftId, "payment_shift_id incorrecto");

  const webStay = (await sql.query(`insert into public.parking_stays(code,parking_id,license_plate,status,entry_at,entry_operator_name,entry_source,updated_at)
    values('E2E-WEBPAY',$1,'CXPY-94', 'OPEN',now()-interval '10 minutes','Portal Webpay','WEB',now()) returning *`, [parking.id])).rows[0];
  const activeRate = (await sql.query("select * from public.parking_rates where parking_id=$1 and status='ACTIVE' order by updated_at desc limit 1", [parking.id])).rows[0];
  const quote = (await sql.query(`insert into public.webpay_stay_quotes(stay_id,stay_updated_at,calculated_at,rate_id,rate_updated_at,rate_blocks_snapshot,elapsed_minutes,rate_name,billing_mode,subtotal_amount,discount_amount,net_amount,tax_amount,total_amount)
    select s.id,s.updated_at,now(),r.id,r.updated_at,'[]',10,r.name,r.billing_mode,1000,0,1000,0,1000 from public.parking_stays s cross join public.parking_rates r where s.id=$1 and r.id=$2 returning id`, [webStay.id, activeRate.id])).rows[0];
  await sql.query("select public.accredit_webpay_parking_stay($1,$2,'WP-E2E-001',1000)", [webStay.id, quote.id]);
  const webPaid = (await sql.query("select payment_shift_id,status,payment_code from public.parking_stays where id=$1", [webStay.id])).rows[0];
  output.checks.webpay_without_payment_shift_id = ok(webPaid.status === "PAID" && webPaid.payment_shift_id === null, "Webpay quedó atribuido a turno");

  const preview = await request(token, "/api/pos/shift");
  const cash = preview.body.data.preview.cashAmount;
  const close = await request(token, "/api/pos/shift/close", { method: "POST", body: JSON.stringify({ confirm: true, declaredCashAmount: cash, differenceObservation: "" }) });
  assert.equal(close.status, 200, JSON.stringify(close.body));
  output.http.close = close.status;
  const closed = (await sql.query("select s.status,s.opened_at,s.opened_by,s.closed_at,s.closed_by,c.* from public.operator_shifts s join public.shift_closures c on c.shift_id=s.id where s.id=$1", [shiftId])).rows[0];
  output.checks.shift_closures = ok(closed.id, "shift_closures faltante");
  output.checks.status_closed = ok(closed.status === "CLOSED", "turno no CLOSED");

  const withoutOpen = await request(token, "/api/data-entry", { method: "POST", body: JSON.stringify({ action: "ENTRY", plate: "NOOPEN" }) });
  output.http.noOpenShift = withoutOpen.status; assert.equal(withoutOpen.status, 409);

  const otherLogin = await admin.auth.signInWithPassword({ email: otherEmail, password });
  if (otherLogin.error) throw otherLogin.error;
  const isolated = await request(otherLogin.data.session.access_token, "/api/data-entry", { method: "POST", body: JSON.stringify({ action: "ENTRY", plate: "ISO123" }) });
  output.http.operatorParkingIsolation = isolated.status;
  assert.notEqual(isolated.status, 201);

  output.evidence = {
    operator: { id: operator.id, email }, parking: { id: parking.id, code: parking.code }, shift: { id: shiftId, status: closed.status, opened_at: closed.opened_at, opened_by: closed.opened_by, closed_at: closed.closed_at, closed_by: closed.closed_by },
    posStay: (await sql.query("select id,code,status,entry_shift_id,payment_shift_id,total_amount,payment_method from public.parking_stays where id=$1", [stayId])).rows[0],
    webpayStay: (await sql.query("select id,code,status,entry_shift_id,payment_shift_id,payment_code from public.parking_stays where id=$1", [webStay.id])).rows[0],
    closure: { id: closed.id, shift_id: closed.shift_id, paid_vehicles_count: closed.paid_vehicles_count, cash_amount: closed.cash_amount, card_amount: closed.card_amount, collected_amount: closed.collected_amount, folio: closed.folio },
  };
  console.log(JSON.stringify(output, null, 2));
} finally {
  await sql.end();
}
