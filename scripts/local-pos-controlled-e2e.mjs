import fs from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const envText = fs.readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^['\"]|['\"]$/g, "")]),
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "https://fstacjpckslamubovwms.supabase.co";
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const dbPassword = env.SUPABASE_DB_PASSWORD;
const appUrl = env.LOCAL_APP_URL || "http://127.0.0.1:3000";

if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
if (!dbPassword) throw new Error("SUPABASE_DB_PASSWORD missing");

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sql = new pg.Client({
  host: "aws-0-ca-central-1.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: `postgres.${projectRef}`,
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
});

const target = {
  email: "operator.test@parkfacil.cl",
  parkingCode: "TEST-POS-001",
  rateNote: "CONTROLLED_PROD_E2E",
  stayCode: "CONTROLLED_PROD_E2E",
  shiftNote: "CONTROLLED_PROD_E2E",
  tempPassword: "Controlled-E2E-2026!",
};

function chileDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}

async function request(token, path, init = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "x-parkfacil-portal": "terminal",
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function ensureUser() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let user = listed.data.users.find((entry) => entry.email === target.email);
  if (!user) {
    const created = await admin.auth.admin.createUser({
      email: target.email,
      password: target.tempPassword,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password: target.tempPassword,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  }
  return user;
}

async function queryOne(text, params = []) {
  const result = await sql.query(text, params);
  return result.rows[0] || null;
}

async function main() {
  await sql.connect();
  try {
    const operator = await ensureUser();
    const parking = await queryOne("select id, code, name, company_id, type, status from public.parkings where code = $1", [target.parkingCode]);
    assert(parking, `No existe el estacionamiento ${target.parkingCode}`);
    assert.equal(parking.type, "OFF_STREET");

    await sql.query("begin");
    try {
      await sql.query("delete from public.parking_stays where parking_id = $1 and code = $2", [parking.id, target.stayCode]);
      await sql.query("delete from public.shift_closures where shift_id in (select id from public.operator_shifts where parking_id = $1 and notes = $2)", [parking.id, target.shiftNote]);
      await sql.query("delete from public.operator_shifts where parking_id = $1 and notes = $2", [parking.id, target.shiftNote]);
      await sql.query("delete from public.operator_assignments where parking_id = $1 and notes = $2", [parking.id, target.shiftNote]);
      await sql.query("delete from public.parking_streets where parking_id = $1 and notes = $2", [parking.id, target.shiftNote]);
      await sql.query("delete from public.parking_sectors where parking_id = $1 and notes = $2", [parking.id, target.shiftNote]);
      await sql.query("delete from public.parking_rates where parking_id = $1 and notes = $2", [parking.id, target.rateNote]);

      await sql.query("update public.parking_rates set status = 'SUSPENDED' where parking_id = $1 and status = 'ACTIVE'", [parking.id]);

      const sector = await queryOne(
        `insert into public.parking_sectors(parking_id, code, name, type, status, capacity, occupied, notes, level, zone, location_description)
         values ($1, 'E', 'Sector E2E', 'OFF_STREET', 'ACTIVE', 10, 0, $2, 'NIVEL 1', 'Z1', 'Sector controlado para E2E')
         returning id, parking_id, code, name`,
        [parking.id, target.shiftNote],
      );

      const street = await queryOne(
        `insert into public.parking_streets(parking_id, sector_id, name, district, status, capacity, occupied, notes)
         values ($1, $2, 'Calle E2E', 'TEST', 'ACTIVE', 10, 0, $3)
         returning id, parking_id, sector_id, name`,
        [parking.id, sector.id, target.shiftNote],
      );

      const assignment = await queryOne(
        `insert into public.operator_assignments(
           operator_id, parking_id, sector_id, street_id, number_from, number_to, max_vehicles,
           valid_from, valid_until, start_time, end_time, days_of_week, status, supervisor_id, notes
         )
         values ($1, $2, $3, $4, 1, 10, 10, $5, null, '00:00', '23:59', array[1,2,3,4,5,6,7]::smallint[], 'ACTIVE', null, $6)
         returning id, operator_id, parking_id, sector_id, street_id`,
        [operator.id, parking.id, sector.id, street.id, chileDate(), target.shiftNote],
      );

      const tempRate = await queryOne(
        `insert into public.parking_rates(
           parking_id, area_id, name, billing_mode, minute_amount, free_period_seconds,
           multiply_by_spaces, daily_flat_amount, valid_from, valid_until, status, notes
         )
         values ($1, null, 'Tarifa temporal controlada', 'EFFECTIVE_MINUTE', 120, 0, false, null, now() - interval '1 minute', null, 'ACTIVE', $2)
         returning id, parking_id, name, status, minute_amount, valid_from`,
        [parking.id, target.rateNote],
      );

      const shiftDate = chileDate();
      const shift = await queryOne(
        `insert into public.operator_shifts(
           operator_id, parking_id, sector_id, street_id, assignment_id, shift_date,
           scheduled_start, scheduled_end, opened_at, closed_at, status, device_id, supervisor_id, notes
         )
         values ($1, $2, $3, $4, $5, $6, '00:00', '23:59', null, null, 'PROGRAMMED', null, null, $7)
         returning *`,
        [operator.id, parking.id, sector.id, street.id, assignment.id, shiftDate, target.shiftNote],
      );

      await sql.query("commit");

      const login = await admin.auth.signInWithPassword({ email: target.email, password: target.tempPassword });
      if (login.error) throw login.error;
      const token = login.data.session.access_token;

      const beforeStart = await request(token, "/api/pos/shift");
      assert.equal(beforeStart.status, 200);
      assert.equal(beforeStart.body?.data?.state, "PROGRAMMED");

      const started = await request(token, "/api/pos/shift/start", { method: "POST", body: JSON.stringify({ shiftId: shift.id }) });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      assert.equal(started.body?.data?.state, "OPEN");
      const openShiftId = started.body?.data?.shift?.id || shift.id;

      const entry = await request(token, "/api/data-entry", {
        method: "POST",
        body: JSON.stringify({ action: "ENTRY", plate: "E2E1-23" }),
      });
      assert.equal(entry.status, 201, JSON.stringify(entry.body));
      const stayId = entry.body?.data?.stay?.id;
      assert(stayId, "No se creó la estadía");
      assert.equal(entry.body?.data?.stay?.entry_shift_id, openShiftId);

      const stayLabel = await sql.query(
        "update public.parking_stays set code = $1 where id = $2 returning id, code, entry_shift_id, payment_shift_id, entry_at, entry_source, status, total_amount, payment_method",
        [target.stayCode, stayId],
      );
      assert.equal(stayLabel.rows.length, 1);

      const payment = await request(token, "/api/data-entry", {
        method: "POST",
        body: JSON.stringify({ action: "EXIT", stayId, paymentMethod: "CASH" }),
      });
      assert.equal(payment.status, 200, JSON.stringify(payment.body));
      assert.equal(payment.body?.data?.stay?.payment_shift_id, openShiftId);
      assert.equal(payment.body?.data?.stay?.payment_method, "CASH");

      const preview = await request(token, "/api/pos/shift");
      assert.equal(preview.status, 200);
      const cashAmount = Number(preview.body?.data?.preview?.cashAmount || 0);
      const paymentAmount = Number(payment.body?.data?.stay?.total_amount || 0);
      assert.equal(cashAmount, paymentAmount);

      const close = await request(token, "/api/pos/shift/close", {
        method: "POST",
        body: JSON.stringify({ confirm: true, declaredCashAmount: cashAmount, differenceObservation: "" }),
      });
      assert.equal(close.status, 200, JSON.stringify(close.body));

      const shiftRow = await queryOne("select id, status, opened_at, closed_at, opened_by, closed_by from public.operator_shifts where id = $1", [openShiftId]);
      const closureRow = await queryOne("select * from public.shift_closures where shift_id = $1", [openShiftId]);
      assert(shiftRow, "No se encontró el turno cerrado");
      assert(closureRow, "No se encontró el cierre");
      assert.equal(shiftRow.status, "CLOSED");

      const suspendedRate = await sql.query("update public.parking_rates set status = 'SUSPENDED' where id = $1 returning id, status", [tempRate.id]);
      assert.equal(suspendedRate.rowCount, 1);

      const finalStay = await queryOne(
        "select id, code, status, entry_shift_id, payment_shift_id, entry_at, exit_at, payment_method, payment_code, total_amount from public.parking_stays where id = $1",
        [stayId],
      );

      console.log(JSON.stringify({
        operator: { id: operator.id, email: operator.email },
        parking: { id: parking.id, code: parking.code, name: parking.name },
        rate: { id: tempRate.id, status: "SUSPENDED", name: tempRate.name, minute_amount: Number(tempRate.minute_amount) },
        assignment: { id: assignment.id, sector_id: assignment.sector_id, street_id: assignment.street_id },
        shift: { id: openShiftId, status: shiftRow.status, opened_at: shiftRow.opened_at, closed_at: shiftRow.closed_at, opened_by: shiftRow.opened_by, closed_by: shiftRow.closed_by },
        stay: finalStay,
        payment: {
          total_amount: paymentAmount,
          payment_method: payment.body?.data?.stay?.payment_method,
          payment_code: payment.body?.data?.stay?.payment_code,
          entry_shift_id: payment.body?.data?.stay?.entry_shift_id,
          payment_shift_id: payment.body?.data?.stay?.payment_shift_id,
        },
        closure: {
          id: closureRow.id,
          folio: closureRow.folio,
          collected_amount: Number(closureRow.collected_amount),
          cash_amount: Number(closureRow.cash_amount),
          card_amount: Number(closureRow.card_amount),
          shift_id: closureRow.shift_id,
          actual_start_at: closureRow.actual_start_at,
          actual_close_at: closureRow.actual_close_at,
          closure_status: closureRow.closure_status,
        },
      }, null, 2));
    } catch (error) {
      await sql.query("rollback").catch(() => null);
      throw error;
    }
  } finally {
    await sql.end().catch(() => null);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});