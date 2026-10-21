import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const hash = x => createHash('sha256').update(x).digest('hex');
const root = randomUUID(), id = randomUUID(), accountIds = [randomUUID(),randomUUID(),randomUUID()];
test('SQL operativo: alta inactiva, activación controlada, H1/H2/H3, sesiones y RLS',async t=>{
 const pg=new PGlite();
 try {
  await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,deleted_at timestamptz,banned_until timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
   grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;`);
  await pg.exec(await readFile(new URL('../docs/contratacion-automatica/operativa-base-solo-pruebas.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../../supabase/migrations/20261020145235_contratacion_integral_access.sql',import.meta.url),'utf8'));
  const scalar=async(q,args=[])=>Object.values((await pg.query(q,args)).rows[0])[0];
  const claims=async(user,iat=Math.ceil(Date.now()/1000)+5)=>pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:'authenticated',iat})]);
  await pg.query('insert into auth.users values($1,$2,$3,null,null)',[root,'root@example.invalid',{role:'platform_admin'}]);
  const accounts=accountIds.map((aid,index)=>({id:aid,email:`local${index}@example.invalid`,role:index?'operator':'company_admin',fullName:'Ficticio',recoveryEmail:'representante@example.invalid'}));
  for(const a of accounts)await pg.query('insert into auth.users values($1,$2,$3,null,null)',[a.id,a.email,{role:'pending_enrollment',enrollment_id:id,credential_scheme:'enrollment_pin_v1'}]);
  const payload={rut:'12.345.678-5',empresa:'EMPRESA LOCAL',giro:'Pruebas',direccion:'Dirección ficticia',comuna:'Comuna',ciudad:'Ciudad',region:'Región',representanteNombres:'Representante',representanteApellidos:'Ficticio Prueba',correo:'empresa@example.invalid',telefono:'+56900000000',planId:'start',plazas:50,estacionamientoNombre:'Estacionamiento local',estacionamientoDireccion:'Dirección ficticia',estacionamientoComuna:'Comuna',estacionamientoCiudad:'Ciudad',estacionamientoRegion:'Región'};
  let company;
  await t.test('una empresa, tres miembros inactivos, estacionamiento DRAFT; reintento idéntico',async()=>{
   const a=await scalar('select contratacion_operational_finish($1,$2,$3,$4)',[id,'a'.repeat(64),payload,accounts]); company=a.companyId;
   assert.deepEqual(await scalar('select contratacion_operational_finish($1,$2,$3,$4)',[id,'a'.repeat(64),payload,accounts]),a);
   assert.equal(await scalar('select count(*)::integer from company_members'),3);
   assert.equal(await scalar('select status from companies where id=$1',[company]),'inactive');
   assert.equal(await scalar('select status from parkings where id=$1',[a.parkingId]),'DRAFT');
   await assert.rejects(()=>pg.query("update companies set status='active' where id=$1",[company]),/CONTROLLED_ACTIVATION/);
  });
  let request;
  await t.test('H1: Root verifica identidad y emite recuperación para administrador todavía inactivo',async()=>{
   await pg.query('select contratacion_recovery_request($1)',[accounts[0].email]);request=await scalar('select id from contratacion_integral.recovery_requests');
   await claims(accounts[0].id);await pg.exec('set role authenticated');await assert.rejects(()=>pg.query('select contratacion_recovery_issue($1,$2,$3)',[request,hash('token1'),'Identidad verificada localmente']),/ROOT_REQUIRED/);await pg.exec('reset role');
   await claims(root);await pg.exec('set role authenticated');const r=await scalar('select contratacion_recovery_issue($1,$2,$3)',[request,hash('token1'),'Identidad verificada localmente']);assert.equal(r.userId,accounts[0].id);await pg.exec('reset role');
   await claims(accounts[0].id);assert.equal(await scalar('select contratacion_session_valid()'),false);
  });
  await t.test('H3: enlace vencido permite reemisión inmediata y revoca el anterior; consumo único',async()=>{
   await pg.exec("update contratacion_integral.recovery_requests set expires_at=now()-interval '1 second'");
   assert.equal(await scalar('select contratacion_recovery_claim($1)',[hash('token1')]),null);
   await claims(root);await pg.exec('set role authenticated');await pg.query('select contratacion_recovery_issue($1,$2,$3)',[request,hash('token2'),'Identidad nuevamente verificada']);await pg.exec('reset role');
   assert.equal(await scalar('select contratacion_recovery_claim($1)',[hash('token1')]),null);
   const r=await scalar('select contratacion_recovery_claim($1)',[hash('token2')]);assert.equal(r.userId,accounts[0].id);
   assert.equal(await scalar('select contratacion_recovery_claim($1)',[hash('token2')]),null);
   await pg.query('select contratacion_recovery_finish($1,$2)',[request,accounts[0].id]);
  });
  const evidence={simulated:false,acceptanceId:randomUUID(),contractId:randomUUID(),paymentId:randomUUID(),documentHash:'a'.repeat(64),acceptedByCustomer:true,contractAccepted:true,paymentVerified:true,currency:'UF',basis:'first_installment',requiredAmount:'16.0650',ufValue:'39500.25',ufDate:'2026-10-20',expectedAmountClp:'634572',paidAmountClp:'634404',withinTolerance:true,reservationId:id,reservationExpiresAt:new Date(Date.now()+300000).toISOString()};
  await t.test('sin evidencia, simulada, incompleta o concurrentemente obsoleta: activación rechazada',async()=>{
   await claims(root);
   for(const [revision,change] of [[1,{simulated:true}],[2,{currency:'CLP'}],[3,{paidAmountClp:'621000'}],[4,{basis:'first_month'}],[5,{expectedAmountClp:'600000',paidAmountClp:'600000'}]]){
    await pg.query('select contratacion_integral_evidence($1,$2,$3)',[id,revision,{...evidence,...change}]);
    await pg.exec('set role authenticated');await assert.rejects(()=>pg.query("select contratacion_integral_status($1,'active',$2,'Prueba local requisitos')",[id,revision]),/COMMERCIAL_REQUIREMENTS/);await pg.exec('reset role');
   }
   await pg.query('select contratacion_integral_evidence($1,6,$2)',[id,evidence]);
   await pg.exec('set role authenticated');await assert.rejects(()=>pg.query("select contratacion_integral_status($1,'active',5,'Evidencia anterior')",[id]),/EVIDENCE_STALE/);await pg.exec('reset role');
  });
  await t.test('H2: activar, suspender con cuatro y cinco miembros, reactivar sin rehabilitar suspensión individual',async()=>{
   await claims(root);await pg.exec('set role authenticated');await pg.query("select contratacion_integral_status($1,'active',6,'Activación inicial local')",[id]);await pg.exec('reset role');
   assert.equal(await scalar('select count(*)::integer from company_members where status=$1',['active']),3);
   await pg.query("update company_members set status='inactive' where user_id=$1",[accounts[1].id]);
   for(let i=0;i<2;i++){
    const aid=randomUUID();await pg.query('insert into auth.users values($1,$2,$3,null,null)',[aid,`extra${i}@example.invalid`,{}]);
    await pg.query("insert into company_members(user_id,company_id,full_name,role,status,pos_only,must_change_password) values($1,$2,'Extra','operator','active',true,false)",[aid,company]);
    await pg.exec('set role authenticated');await pg.query("select contratacion_integral_status($1,'inactive',6,'Suspensión empresa local')",[id]);await pg.query("select contratacion_integral_status($1,'active',6,'Reactivación empresa local')",[id]);await pg.exec('reset role');
    assert.equal(await scalar('select status from company_members where user_id=$1',[accounts[1].id]),'inactive');
   }
   assert.equal(await scalar('select status from parkings limit 1'),'DRAFT');
  });
  await t.test('sesión anterior a recuperación bloqueada y suspensión invalida sesión ya abierta',async()=>{
   await claims(accounts[0].id,1);assert.equal(await scalar('select contratacion_session_valid()'),false);
   await claims(accounts[0].id);assert.equal(await scalar('select contratacion_session_valid()'),true);
   await claims(root);await pg.exec('set role authenticated');await pg.query("select contratacion_integral_status($1,'inactive',6,'Revocar sesión abierta')",[id]);await pg.exec('reset role');
   await claims(accounts[0].id);assert.equal(await scalar('select contratacion_session_valid()'),false);
   await pg.exec('set role authenticated');await assert.rejects(()=>pg.query('select * from contratacion_integral.recovery_requests'));await pg.exec('reset role');
   await assert.rejects(()=>pg.exec('delete from contratacion_integral.credential_events'));
  });
 }finally{await pg.close();}
});
