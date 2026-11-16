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
  temporaryPassword: "Controlled-E2E-2026!",
  rateNote: "CONTROLLED_PROD_E2E_02_RATE",
  shiftNote: "CONTROLLED_PROD_E2E_02_SHIFT",
  stayCode: "CONTROLLED_PROD_E2E_02",
  plate: "E2E2-34",
};

function chileDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}

async function queryOne(text, params = []) {
  const result = await sql.query(text, params);
  return result.rows[0] || null;
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
    const created = await admin.auth.admin.createUser({ email: target.email, password: target.temporaryPassword, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, { password: target.temporaryPassword, email_confirm: true });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  }
  return user;
}

async function main() {
  await sql.connect();
  try {
    const operator = await ensureUser();
    const parking = await queryOne("select id, code, name, type, status from public.parkings where code = $1", [target.parkingCode]);
    assert(parking, "No existe TEST-POS-001");
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
         values ($1, 'B', 'Sector B E2E 02', 'OFF_STREET', 'ACTIVE', 10, 0, $2, 'NIVEL 1', 'Z1', 'Sector controlado para segunda prueba')
         returning id`,
        [parking.id, target.shiftNote],
      );

      const street = await queryOne(
        `insert into public.parking_streets(parking_id, sector_id, name, district, status, capacity, occupied, notes)
         values ($1, $2, 'Calle B E2E 02', 'TEST', 'ACTIVE', 10, 0, $3)
         returning id`,
        [parking.id, sector.id, target.shiftNote],
      );

      const assignment = await queryOne(
        `insert into public.operator_assignments(
           operator_id, parking_id, sector_id, street_id, number_from, number_to, max_vehicles,
           valid_from, valid_until, start_time, end_time, days_of_week, status, notes
         )
         values ($1, $2, $3, $4, 11, 20, 10, $5, null, '00:00', '23:59', array[1,2,3,4,5,6,7]::smallint[], 'ACTIVE', $6)
         returning id`,
        [operator.id, parking.id, sector.id, street.id, chileDate(), target.shiftNote],
      );

      const tempRate = await queryOne(
        `insert into public.parking_rates(
           parking_id, area_id, name, billing_mode, minute_amount, free_period_seconds,
           multiply_by_spaces, daily_flat_amount, valid_from, valid_until, status, notes
         )
         values ($1, null, 'Tarifa temporal controlada 02', 'EFFECTIVE_MINUTE', 1000, 0, false, null, now() - interval '1 minute', null, 'ACTIVE', $2)
         returning id, status, minute_amount, name`,
        [parking.id, target.rateNote],
      );

      const shift = await queryOne(
        `insert into public.operator_shifts(
           operator_id, parking_id, sector_id, street_id, assignment_id, shift_date,
           scheduled_start, scheduled_end, opened_at, closed_at, status, notes
         )
         values ($1, $2, $3, $4, $5, $6, '00:00', '23:59', null, null, 'PROGRAMMED', $7)
         returning *`,
        [operator.id, parking.id, sector.id, street.id, assignment.id, chileDate(), target.shiftNote],
      );

      await sql.query("commit");

      const login = await admin.auth.signInWithPassword({ email: target.email, password: target.temporaryPassword });
      if (login.error) throw login.error;
      const token = login.data.session.access_token;

      const initial = await request(token, "/api/pos/shift");
      assert.equal(initial.status, 200);
      assert.equal(initial.body?.data?.state, "PROGRAMMED");

      const start = await request(token, "/api/pos/shift/start", { method: "POST", body: JSON.stringify({ shiftId: shift.id }) });
      assert.equal(start.status, 200, JSON.stringify(start.body));
      assert.equal(start.body?.data?.state, "OPEN");
      const shiftId = start.body?.data?.shift?.id || shift.id;

      const entry = await request(token, "/api/data-entry", {
        method: "POST",
        body: JSON.stringify({ action: "ENTRY", plate: target.plate }),
      });
      assert.equal(entry.status, 201, JSON.stringify(entry.body));
      const stayId = entry.body?.data?.stay?.id;
      assert(stayId, "No se creó la estadía de segunda prueba");
      assert.equal(entry.body?.data?.stay?.entry_shift_id, shiftId);

      await sql.query(
        "update public.parking_stays set code = $1, entry_at = now() - interval '70 seconds' where id = $2",
        [target.stayCode, stayId],
      );

      const exit = await request(token, "/api/data-entry", {
        method: "POST",
        body: JSON.stringify({ action: "EXIT", stayId, paymentMethod: "CASH" }),
      });
      assert.equal(exit.status, 200, JSON.stringify(exit.body));
      assert.equal(exit.body?.data?.stay?.entry_shift_id, shiftId);
      assert.equal(exit.body?.data?.stay?.payment_shift_id, shiftId);
      assert.equal(Number(exit.body?.data?.stay?.total_amount || 0), 1000);
      assert.equal(exit.body?.data?.stay?.payment_method, "CASH");

      const preview = await request(token, "/api/pos/shift");
      assert.equal(preview.status, 200);
      const previewData = preview.body?.data?.preview || {};
      assert.equal(Number(previewData.confirmedPaymentsCount || 0), 1);
      assert.equal(Number(previewData.cashAmount || 0), 1000);
      assert.equal(Number(previewData.grossAmount || 0), 1000);

      const close = await request(token, "/api/pos/shift/close", {
        method: "POST",
        body: JSON.stringify({ confirm: true, declaredCashAmount: 1000, differenceObservation: "" }),
      });
      assert.equal(close.status, 200, JSON.stringify(close.body));

      const shiftRow = await queryOne("select id, status, opened_at, closed_at, opened_by, closed_by from public.operator_shifts where id = $1", [shiftId]);
      const closureRow = await queryOne("select id, shift_id, cash_amount, collected_amount, card_amount, folio from public.shift_closures where shift_id = $1", [shiftId]);
      assert(shiftRow, "No se encontró el turno final");
      assert(closureRow, "No se encontró el cierre final");
      assert.equal(shiftRow.status, "CLOSED");
      assert.equal(Number(closureRow.cash_amount), 1000);
      assert.equal(Number(closureRow.collected_amount), 1000);

      await sql.query("update public.parking_rates set status = 'SUSPENDED' where id = $1", [tempRate.id]);

      const finalRate = await queryOne("select id, status from public.parking_rates where id = $1", [tempRate.id]);
      const finalStay = await queryOne("select id, code, status, entry_shift_id, payment_shift_id, payment_method, payment_code, total_amount from public.parking_stays where id = $1", [stayId]);

      console.log(JSON.stringify({
        rate: { id: tempRate.id, status: finalRate.status },
        shift: { id: shiftId, status: shiftRow.status, opened_at: shiftRow.opened_at, closed_at: shiftRow.closed_at },
        stay: finalStay,
        payment: {
          amount: Number(exit.body?.data?.stay?.total_amount || 0),
          payment_method: exit.body?.data?.stay?.payment_method,
          entry_shift_id: exit.body?.data?.stay?.entry_shift_id,
          payment_shift_id: exit.body?.data?.stay?.payment_shift_id,
        },
        closure: {
          id: closureRow.id,
          folio: closureRow.folio,
          cash_amount: Number(closureRow.cash_amount),
          collected_amount: Number(closureRow.collected_amount),
          card_amount: Number(closureRow.card_amount),
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