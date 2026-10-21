import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const enrollment='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',root='33333333-3333-4333-8333-333333333333';
const sql=await fs.readFile(new URL('../docs/contratacion-automatica/temporary-pin-PROPUESTA-NO-APLICADA.sql',import.meta.url),'utf8');
test('SQL PIN en PostgreSQL embebido: permisos, intentos, versiones, historial y reinicio',async t=>{
 let pg=new PGlite();
 try{
 await pg.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema contratacion_private;
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,deleted_at timestamptz,banned_until timestamptz);
 create table public.web_enrollments(id uuid primary key,company_id text);
 create table public.companies(id text primary key,status text);
 create table public.company_members(user_id uuid,company_id text,status text,role text);
 create table contratacion_private.status_history(company_id text,new_status text);
 create function public.contratacion_reject_delete() returns trigger language plpgsql as $$ begin raise exception 'HISTORY_IMMUTABLE';end $$;`);
 await pg.exec(sql);
 await pg.query('insert into auth.users values($1,$2,$3,null,null),($4,$5,$6,null,null)',[user,'local@example.invalid',{credential_scheme:'qa_pin_v1',enrollment_id:enrollment},root,'root@example.invalid',{role:'platform_admin'}]);
 await pg.query('insert into public.web_enrollments values($1,$2)',[enrollment,'local-company']);
 await pg.exec("insert into public.companies values('local-company','inactive');insert into public.company_members values('22222222-2222-4222-8222-222222222222','local-company','inactive','company_admin');");
 const scalar=async(sql,args=[])=>Object.values((await pg.query(sql,args)).rows[0])[0];
 const register=()=>pg.query('select public.qa_pin_register($1,$2,$3,$4,$5)',[user,enrollment,'local@example.invalid','a'.repeat(64),'b'.repeat(64)]);
 const attempt=(email='local@example.invalid',reauth=null)=>scalar('select public.qa_pin_attempt($1,$2)',[email,reauth]);
 await t.test('aplica esquema; anon/authenticated no ejecutan ni leen; service_role solo RPC',async()=>{
 for(const role of ['anon','authenticated','service_role']){
 await pg.exec('set role '+role);
 await assert.rejects(()=>pg.query('select * from contratacion_pin_private.credentials'));
 if(role!=='service_role')await assert.rejects(()=>attempt());
 else await register();
 await pg.exec('reset role');
 }
 });
 await t.test('registro ajeno rechazado; reintento no cambia hash ni vencimiento',async()=>{
 await assert.rejects(()=>pg.query('select public.qa_pin_register($1,$2,$3,$4,$5)',[root,enrollment,'root@example.invalid','a'.repeat(64),'b'.repeat(64)]));
 const before=(await pg.query('select hash,expires_at from contratacion_pin_private.credentials')).rows[0];
 await register();const after=(await pg.query('select hash,expires_at from contratacion_pin_private.credentials')).rows[0];assert.deepEqual(after,before);
 });
 await t.test('quinto intento permitido; sexto bloqueado y usuario ausente devuelve null',async()=>{
 for(let i=0;i<5;i++)assert.equal((await attempt()).userId,user);
 assert.equal(await attempt(),null);assert.equal(await attempt('missing@example.invalid'),null);
 });
 await t.test('contador sobrevive exportación y reinicio del motor',async()=>{
 const snapshot=await pg.dumpDataDir();await pg.close();pg=new PGlite({loadDataDir:snapshot});
 assert.equal(await attempt(),null);
 });
 await t.test('ventana expirada permite reintentar y éxito conserva control de versión',async()=>{
 await pg.exec("update contratacion_pin_private.credentials set window_until=now()-interval '1 minute'");
 const record=await attempt();assert.ok(record);await register();
 assert.equal(await scalar('select public.qa_pin_success($1,$2)',[user,record.revision]),true);
 assert.equal(await scalar('select public.qa_pin_success($1,$2)',[user,record.revision]),false);
 assert.ok(await attempt());assert.ok(await attempt('local@example.invalid',user));
 await pg.query("update auth.users set raw_app_meta_data=raw_app_meta_data||'{\"qa_credentials_changed\":true}'::jsonb where id=$1",[user]);
 assert.equal(await attempt('local@example.invalid',user),null);
 });
 await t.test('clave vencida se rechaza incluso con sesión; límite global cubre identidades ausentes',async()=>{
 await pg.exec("update contratacion_pin_private.credentials set expires_at=now()-interval '1 minute'");
 assert.equal(await attempt('local@example.invalid',user),null);
 for(let i=0;i<101;i++)assert.equal(await attempt('missing@example.invalid'),null);
 assert.equal(await scalar('select attempts from contratacion_pin_private.rate_limit where id=1'),100);
 });
 await t.test('acceso refleja estados reales e historial; revelado exige Root y conserva auditoría',async()=>{
 let state=await scalar('select public.qa_pin_access($1,$2)',[user,enrollment]);assert.equal(state.everActivated,false);assert.equal(state.companyStatus,'inactive');
 await pg.exec("insert into contratacion_private.status_history values('local-company','active')");
 state=await scalar('select public.qa_pin_access($1,$2)',[user,enrollment]);assert.equal(state.everActivated,true);
 assert.equal(await scalar('select public.qa_pin_access($1,$2)',[root,enrollment]),null);
 await assert.rejects(()=>pg.query('select public.qa_pin_audit_reveal($1,$2)',[user,enrollment]));
 await pg.query('select public.qa_pin_audit_reveal($1,$2)',[root,enrollment]);
 assert.equal(await scalar('select count(*)::integer from contratacion_pin_private.reveal_audit'),1);
 await assert.rejects(()=>pg.query('delete from contratacion_pin_private.reveal_audit'));
 });
 }finally{await pg.close();}
});

