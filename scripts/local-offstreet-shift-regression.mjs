// Isolated in-memory PostgreSQL. No .env, remote connection or real shift IDs.
// Install PGlite separately: npm install --prefix .tmp-shift-db --no-save @electric-sql/pglite
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
const realPostgres = process.argv.includes("--postgres");
const database = `parkfacil_sol_20261008_004_${process.pid}`;
let db;
if (realPostgres) {
  const admin = new pg.Client({ host:"127.0.0.1",port:6543,user:"postgres",password:"postgres",database:"postgres" });
  await admin.connect();
  await admin.query(`create database ${database}`);
  await admin.end();
  db = new pg.Client({ host:"127.0.0.1",port:6543,user:"postgres",password:"postgres",database });
  await db.connect();
  db.exec = sql => db.query(sql);
  db.close = () => db.end();
} else {
  const { PGlite } = await import("../.tmp-shift-db/node_modules/@electric-sql/pglite/dist/index.js");
  db = new PGlite();
}
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const baseline = read("supabase/migrations/20260728160000_parking_operational_structure.sql");
const pos = read("supabase/migrations/20260817130000_operator_shifts_pos_traceability.sql");
const table = name => baseline.match(new RegExp(`create table if not exists public\\.${name} \\([\\s\\S]*?\\n\\);`))[0];
await db.exec(`${realPostgres ? "" : "create role anon; create role authenticated; create role service_role;"}
create schema auth; create table auth.users(id uuid primary key);
create table parkings(id uuid primary key, name text, company_name text, type text, status text);
create table parking_sectors(id uuid primary key, code text, name text);
create table parking_streets(id uuid primary key, name text);
create table operator_assignments(id uuid primary key, number_from integer, number_to integer, max_vehicles integer);
create table parking_rates(id uuid primary key);`);
for (const name of ["operator_shifts", "shift_closures", "shift_handoffs", "shift_incidents"]) await db.exec(table(name));
await db.exec(baseline.slice(baseline.indexOf("alter table public.shift_closures\n  add column"),baseline.indexOf("-- Transacción única")));
const stays = read("supabase/migrations/20260731130000_parking_stays_tickets.sql");
await db.exec(stays);
await db.exec(pos);
const migration = read("supabase/migrations/20261008120000_operator_shift_closure_idempotency.sql");
await db.exec("grant select,insert,update on public.operator_shifts to service_role");
assert.equal((await db.query("select has_table_privilege('service_role','public.operator_shifts','DELETE') as allowed")).rows[0].allowed,false);
await db.exec(migration);
assert.equal((await db.query("select has_table_privilege('service_role','public.operator_shifts','DELETE') as allowed")).rows[0].allowed,true);
await db.exec(migration); // repeat application is safe
const uid = n => `${n.toString(16).padStart(8,"0")}-0000-4000-8000-${String(n).padStart(12,"0")}`;
const parking = uid(1), otherParking = uid(2), operator = uid(3);
await db.query("insert into auth.users values($1)",[operator]);
await db.query("insert into parkings values($1,'Ficticio','Empresa ficticia','OFF_STREET','ACTIVE'),($2,'Otro','Otra empresa','OFF_STREET','ACTIVE')",[parking,otherParking]);
async function shift(n,status="PROGRAMMED") {
  const id=uid(n);
  await db.query("insert into operator_shifts(id,operator_id,parking_id,shift_date,scheduled_start,scheduled_end,status,opened_at) values($1,$2,$3,'2026-10-08','08:00','18:00',$4,case when $4='OPEN' then now() else null end)",[id,operator,parking,status]);
  return id;
}
async function close(id,actor=operator,admin=false) {
  return (await db.query("select (public.close_operator_shift($1,$2,'Operador ficticio',$3,'',null,null)).*",[id,actor,admin])).rows[0];
}
// Exact conditional mutation from DELETE route, executed against PostgreSQL.
const route = read("src/app/api/estacionamientos/[id]/turnos/[turnoId]/route.js");
assert.match(route,/PERMISSIONS.PARKINGS_MANAGE/);
assert.match(route,/\.eq\("status", currentShift.status\)\.is\("opened_at", null\)\.is\("closed_at", null\)\.select\("id"\)/);
async function remove(id,parkingId=parking,state="PROGRAMMED") {
  return (await db.query("delete from operator_shifts where id=$1 and parking_id=$2 and status=$3 and opened_at is null and closed_at is null returning id",[id,parkingId,state])).rows;
}
const passed=[];
const roleShift=await shift(30);
await db.exec("begin; set local role service_role");
assert.equal((await remove(roleShift)).length,1);
await db.exec("commit");
passed.push("permiso DELETE ausente antes de migración; service_role elimina el ficticio después");
let id=await shift(10); assert.equal((await remove(id)).length,1); passed.push("programado vacío eliminado con RETURNING");
id=await shift(11); assert.equal((await remove(id,otherParking)).length,0); passed.push("aislamiento de estacionamiento en DELETE");
// Simulates the opening committed after the API reads PROGRAMMED and before DELETE executes.
await db.query("select public.start_operator_shift($1,$2,false)",[id,operator]);
assert.equal((await remove(id)).length,0); passed.push("apertura entre lectura y DELETE conserva turno");
let empty=await close(id); assert.equal(Number(empty.collected_amount),0); assert.equal(empty.pending_vehicles_count,0); passed.push("cierre vacío persistido");
let repeated=await close(id); assert.equal(repeated.id,empty.id);
assert.equal((await db.query("select count(*)::integer as n from shift_closures where shift_id=$1",[id])).rows[0].n,1); passed.push("doble cierre devuelve mismo comprobante");
await assert.rejects(close(id,uid(99)),/SHIFT_FORBIDDEN/); passed.push("repetición sin autorización rechazada");
id=await shift(12,"OPEN");
await db.query(`insert into parking_stays(code,parking_id,license_plate,entry_operator_name,entry_operator_id,entry_shift_id)
values('FICTICIO-PENDIENTE',$1,'ABCD-12','Ficticio',$2,$3)`,[parking,operator,id]);
await db.query(`insert into parking_stays(code,parking_id,license_plate,entry_operator_name,entry_operator_id,entry_shift_id,status,exit_at,exit_operator_id,payment_shift_id,payment_code,payment_method,total_amount)
values('FICTICIO-PAGO',$1,'ABCD-13','Ficticio',$2,$3,'PAID',now(),$2,$3,'FICTICIO-COMPROBANTE','CASH',1200)`,[parking,operator,id]);
const paid=await close(id); assert.equal(Number(paid.collected_amount),1200); assert.equal(paid.paid_vehicles_count,1); assert.equal(paid.pending_vehicles_count,1);
assert.equal((await db.query("select status from parking_stays where code='FICTICIO-PENDIENTE'")).rows[0].status,"OPEN"); passed.push("pagos y pendientes persistentes; estadía permanece abierta");
assert.equal((await remove(id)).length,0); passed.push("turno cerrado no se elimina");
// Even if a legacy record is reprogrammed, RESTRICT protects the linked activity.
await db.query("update operator_shifts set status='PROGRAMMED',opened_at=null,closed_at=null where id=$1",[id]);
await assert.rejects(remove(id),/foreign key constraint/); passed.push("actividad vinculada impide borrado sin cascada");
id=await shift(13,"OPEN");
await db.exec("alter table parking_stays rename to unavailable_stays");
await assert.rejects(close(id),/parking_stays/);
assert.equal((await db.query("select status from operator_shifts where id=$1",[id])).rows[0].status,"OPEN");
assert.equal((await db.query("select count(*)::integer as n from shift_closures where shift_id=$1",[id])).rows[0].n,0); passed.push("fuente fallida revierte cierre sin totales ficticios");
await db.exec("alter table unavailable_stays rename to parking_stays");
if (realPostgres) {
  const peer = new pg.Client({ host:"127.0.0.1",port:6543,user:"postgres",password:"postgres",database });
  await peer.connect();
  // Independent connections contend on the same row. No timing assumption: check wait_event_type.
  const peerPid=(await peer.query("select pg_backend_pid() as pid")).rows[0].pid;
  async function waitForLock() {
    for (let attempt=0;attempt<100;attempt++) {
      const state=(await db.query("select wait_event_type from pg_stat_activity where pid=$1",[peerPid])).rows[0];
      if (state?.wait_event_type === "Lock") return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error("No se observó contención real del bloqueo");
  }
  // Close the previous open fixture before testing an opening.
  await close(id);
  id=await shift(20);
  await db.exec("begin");
  await db.query("select public.start_operator_shift($1,$2,false)",[id,operator]);
  const deletion=peer.query("delete from operator_shifts where id=$1 and parking_id=$2 and status='PROGRAMMED' and opened_at is null and closed_at is null returning id",[id,parking]);
  await waitForLock(); await db.exec("commit");
  assert.equal((await deletion).rows.length,0); passed.push("dos conexiones: apertura gana y DELETE reevalúa estado");
  await close(id);
  id=await shift(21);
  await db.exec("begin"); await remove(id);
  const opening=peer.query("select public.start_operator_shift($1,$2,false)",[id,operator]).then(()=>null,e=>e);
  await waitForLock(); await db.exec("commit");
  assert.match((await opening).message,/SHIFT_NOT_FOUND/); passed.push("dos conexiones: borrado gana y apertura no revive turno");
  id=await shift(22,"OPEN");
  await db.exec("begin");
  const first=await close(id);
  const second=peer.query("select (public.close_operator_shift($1,$2,'Ficticio',false,'',null,null)).*",[id,operator]);
  await waitForLock(); await db.exec("commit");
  assert.equal((await second).rows[0].id,first.id); passed.push("dos conexiones: confirmaciones concurrentes devuelven un comprobante");
  await peer.end();
}
console.log(JSON.stringify({date:"2026-10-08",engine:realPostgres ? "PostgreSQL local: 127.0.0.1:6543" : "PGlite PostgreSQL aislado",database:realPostgres ? database : "memoria aislada",checks:passed.length,passed,limitations:[...(!realPostgres ? ["Una sesión: no demuestra bloqueo entre dos conexiones concurrentes."] : []),"Esquema mínimo con DDL reales de turnos, cierres y estadías; no valida el baseline completo.","Sin anulación financiera POS persistente: no se inventó esa operación."]},null,2));
await db.close();
