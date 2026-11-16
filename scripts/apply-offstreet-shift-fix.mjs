// SOL-2026-10-08-004. Applies only the explicitly authorized, pinned migration.
import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
assert(process.argv.includes("--apply"), "Requiere --apply y autorización explícita previa.");
assert(process.argv.includes("--project-ref=fstacjpckslamubovwms"), "Destino no autorizado.");
const env=Object.fromEntries(fs.readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).flatMap(line=>{
  const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);return m ? [[m[1],m[2].replace(/^(['"])(.*)\1$/,"$2")]] : [];
}));
const sql=fs.readFileSync(new URL("../supabase/migrations/20261008120000_operator_shift_closure_idempotency.sql",import.meta.url),"utf8");
const sha256=createHash("sha256").update(sql).digest("hex");
assert.equal(sha256,"5bbf1f9e7e51c56d46a7784fc7c3e419cb92daa80aec87d347e8d0f51d0c8108");
const client=new pg.Client({host:env.SUPABASE_DB_HOST,port:Number(env.SUPABASE_DB_PORT||5432),user:"postgres.fstacjpckslamubovwms",password:env.SUPABASE_DB_PASSWORD,database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const version="20261008120000";
try {
  await client.connect();
  await client.query("begin");
  await client.query("set local lock_timeout='10s'; set local statement_timeout='30s'");
  await client.query("select pg_advisory_xact_lock(hashtext($1))",[version]);
  const snapshot=async()=> (await client.query("select id,status,opened_at,closed_at from operator_shifts where id in ('7ad4face-06ab-479f-8858-a58c15665108','15deae8f-871e-4ba5-a5c7-c57bf696a737') order by id")).rows;
  const before=await snapshot();
  const existing=(await client.query("select statements from supabase_migrations.schema_migrations where version=$1",[version])).rows[0];
  if (existing) assert.equal(existing.statements?.join("\n"),sql,"La versión ya existe con contenido diferente.");
  else {
    await client.query(sql);
    await client.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)",[version,"operator_shift_closure_idempotency",[sql]]);
  }
  const verified=(await client.query(`select has_table_privilege('service_role','public.operator_shifts','DELETE') as can_delete,
    position('if found then return v_closure' in prosrc)>0 as idempotent
    from pg_proc where oid='public.close_operator_shift(uuid,text,text,boolean,text,numeric,text)'::regprocedure`)).rows[0];
  assert.equal(verified.can_delete,true);assert.equal(verified.idempotent,true);
  assert.deepEqual(await snapshot(),before,"Cambió un turno real durante la ejecución; se revierte la migración.");
  await client.query("commit");
  console.log(JSON.stringify({applied:!existing,alreadyApplied:Boolean(existing),version,sha256,projectRef:"fstacjpckslamubovwms",verified,realShiftsUnchanged:true},null,2));
} catch(error) {
  await client.query("rollback").catch(()=>{});
  console.error(JSON.stringify({applied:false,code:error.code||"MIGRATION_FAILED",message:String(error.message).replaceAll(env.SUPABASE_DB_PASSWORD||"__NONE__","[redacted]")}));
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
