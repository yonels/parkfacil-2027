import pg from "pg";
const c=new pg.Client({host:"aws-0-ca-central-1.pooler.supabase.com",port:5432,database:"postgres",user:"postgres.fstacjpckslamubovwms",password:process.env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect();const tag=process.argv[2],q=(sql,params=[])=>c.query(sql,params);
try{
 const tables=(await q("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('billing_documents','billing_document_lines','billing_account_movements') order by 1")).rows;
 const constraints=(await q("select conrelid::regclass::text table_name,contype,count(*)::int count from pg_constraint where conrelid in('billing_documents'::regclass,'billing_document_lines'::regclass) group by 1,2 order by 1,2")).rows;
 const indexes=(await q("select tablename,indexname from pg_indexes where schemaname='public' and tablename in('billing_documents','billing_document_lines') order by 1,2")).rows;
 const triggers=(await q("select event_object_table,trigger_name,event_manipulation from information_schema.triggers where event_object_schema='public' and event_object_table in('billing_documents','billing_document_lines') order by 1,2,3")).rows;
 const grants=(await q("select grantee,table_name,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in('billing_documents','billing_document_lines') and grantee in('anon','authenticated')")).rows;
 const migration=(await q("select version,name from supabase_migrations.schema_migrations where version='20260811180000'")).rows;
 const account=(await q("select p.internal_number,d.id invoice_id,sum(m.debit_amount)::numeric debe,sum(m.credit_amount)::numeric haber,sum(m.debit_amount-m.credit_amount)::numeric saldo from billing_preinvoices p join billing_documents d on d.preinvoice_id=p.id and d.document_type='INVOICE' join billing_account_movements m on m.document_id=d.id or m.document_id in(select id from billing_documents where document_reference_id=d.id) or (m.idempotency_key=$2 and m.company_id=d.company_id) where p.internal_number like $1 group by p.internal_number,d.id",[`%${tag}-ACCOUNT%`,`${tag}-payment`])).rows;
 const audit=(await q("select action,count(*)::int count from billing_audit_events a join billing_preinvoices p on p.id=a.preinvoice_id where p.internal_number like $1 group by action order by action",[`%${tag}%`])).rows;
 console.log(JSON.stringify({migration,tables,constraints,indexes,triggers,directGrantsAnonAuthenticated:grants,account,audit},null,2));
}finally{await c.end()}
