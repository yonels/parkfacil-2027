// Remote diagnosis only: SELECT inside an explicit read-only transaction.
import fs from "node:fs";
import pg from "pg";
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local",import.meta.url),"utf8").split(/\r?\n/).flatMap(line => {
  const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  return match ? [[match[1],match[2].replace(/^(['"])(.*)\1$/,"$2")]] : [];
}));
const projectRef = process.argv.find(arg => arg.startsWith("--project-ref="))?.split("=")[1] || new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Indica --project-ref para auditar un proyecto remoto identificado; .env.local apunta a localhost.");
const client = new pg.Client({host:env.SUPABASE_DB_HOST,port:Number(env.SUPABASE_DB_PORT||5432),user:env.SUPABASE_DB_HOST?.includes("pooler") ? `postgres.${projectRef}` : "postgres",password:env.SUPABASE_DB_PASSWORD,database:"postgres",ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000});
try {
  await client.connect();
  await client.query("begin read only");
  await client.query("set local statement_timeout='8s'");
  const functions=(await client.query(`select oid::regprocedure::text as signature,
    position('parking_stays' in prosrc)>0 as uses_parking_stays,
    position('if found then return v_closure' in prosrc)>0 as returns_existing_closure,
    position('OPERATIONAL_DATA_SOURCE_UNAVAILABLE' in prosrc)>0 as has_source_guard
    from pg_proc where pronamespace='public'::regnamespace and proname='close_operator_shift'`)).rows;
  const foreignKeys=(await client.query(`select conrelid::regclass::text as source,conname,pg_get_constraintdef(oid) as definition
    from pg_constraint where contype='f' and confrelid='public.operator_shifts'::regclass`)).rows;
  const triggers=(await client.query(`select t.tgname,pg_get_triggerdef(t.oid) as definition,p.prosrc as function_source
    from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.operator_shifts'::regclass and not t.tgisinternal`)).rows;
  const permissions=(await client.query(`select relrowsecurity as rls,
    has_table_privilege('service_role','public.operator_shifts','DELETE') as service_role_can_delete
    from pg_class where oid='public.operator_shifts'::regclass`)).rows;
  const wrapper=(await client.query(`select prosrc from pg_proc where oid='public.close_operator_shift(uuid,text,text,boolean,text)'::regprocedure`)).rows;
  const shifts=(await client.query(`select s.id,s.operator_id,m.full_name as operator_name,s.shift_date,s.status,s.opened_at,s.closed_at,p.type,p.code as parking_code,
    (select count(*) from parking_stays ps where ps.entry_shift_id=s.id or ps.payment_shift_id=s.id)::integer as linked_stays,
    (select count(*) from shift_closures c where c.shift_id=s.id)::integer as closures,
    (select count(*) from shift_incidents i where i.shift_id=s.id)::integer as incidents,
    (select count(*) from shift_handoffs h where h.incoming_shift_id=s.id or h.outgoing_shift_id=s.id)::integer as handoffs,
    (select count(*) from parking_stays ps where ps.payment_shift_id=s.id and ps.parking_id=s.parking_id and ps.status='PAID')::integer as paid_stays,
    (select coalesce(sum(total_amount),0) from parking_stays ps where ps.payment_shift_id=s.id and ps.parking_id=s.parking_id and ps.status='PAID') as collected_amount,
    (select count(*) from parking_stays ps where ps.parking_id=s.parking_id and ps.status='OPEN')::integer as current_parking_pending,
    s.assignment_id is not null as has_assignment
    from operator_shifts s join parkings p on p.id=s.parking_id
    join company_members m on m.user_id::text=s.operator_id and m.company_id=p.company_id
    where s.shift_date in ('2026-08-09','2026-08-18') and m.full_name ilike '%Operador%1%5Q%'`)).rows;
  console.log(JSON.stringify({date:"2026-10-08",mode:"READ ONLY",functions,foreignKeys,triggers,permissions,wrapper,shifts},null,2));
  await client.query("rollback");
} catch(error) {
  const message = String(error.message).replaceAll(env.SUPABASE_DB_PASSWORD || "__NO_PASSWORD__", "[redacted]");
  console.log(JSON.stringify({date:"2026-10-08",mode:"READ ONLY",error:{code:error.code||"CONNECTION_FAILED",message}}));
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
