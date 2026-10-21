import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, fingerprint, accountsFor, ensureAccount, provision } from './contratacionProvision.mjs';
import { deliverCredentials } from './contratacionDelivery.mjs';

const id='abcde123-4567-4567-8901-abcdef123456';
const key='ab'.repeat(32);
const registro={empresa:'Empresa ficticia',correo:'prueba@example.invalid',representanteCorreo:'representante@example.invalid',representanteNombres:'Ana',representanteApellidos:'Prueba',aceptacion:{fechaHora:'2026-10-11',condicionesAceptadas:true}};

function environment() {
  let job=null, delivery=null;
  const users=[];
  let calls=0, failAt=0, finishCount=0;
  const crm={ async rpc(name,args) {
    if(name==='contratacion_begin') {
      if(job && job.fingerprint!==args.p_fingerprint) return {error:{}};
      if(job && job.state!=='failed') return {data:{state:job.state,claimed:false}};
      if(!job) job={state:'processing',credentials:args.p_credentials,payload:args.p_payload,fingerprint:args.p_fingerprint};
      job.state='processing';return {data:{...job,claimed:true}};
    }
    if(name==='contratacion_complete') {job.state='completed';delivery={state:'pending'};return {data:null};}
    if(name==='contratacion_fail') {job.state='failed';return {data:null};}
    if(name==='contratacion_delivery_claim') {
      if(['sending','sent'].includes(delivery.state))return {data:{claimed:false,state:delivery.state}};
      delivery.state='sending';return {data:{claimed:true,email:job.payload.correo,credentials:job.credentials}};
    }
    if(name==='contratacion_delivery_finish') {delivery.state=args.p_sent?'sent':'failed';if(args.p_sent)job.credentials=null;return {data:null};}
    throw Error(name);
  }};
  const operational={auth:{admin:{
    async createUser(input){calls++;if(calls===failAt)return {error:{code:'server_error'}};
      if(users.some(u=>u.email===input.email))return {error:{code:'email_exists'}};
      const user={id:String(users.length+1),email:input.email,app_metadata:input.app_metadata};users.push(user);return {data:{user}};},
    async listUsers(){return {data:{users}};},
    async updateUserById(uid,input){Object.assign(users.find(u=>u.id===uid),input);return {data:{}};},
  }},async rpc(name){assert.equal(name,'contratacion_operational_finish');finishCount++;return {data:{companyId:'emp-'+id,parkingId:id}};}};
  return {crm,operational,users,failOn(n){failAt=n;},get job(){return job;},get calls(){return calls;},get finishCount(){return finishCount;}};
}
const run=e=>provision({...e,id,registro,key});

test('cifrado autenticado y sin clave legible',()=>{const enc=seal({password:'secreto'},key,id);assert.ok(!enc.includes('secreto'));assert.deepEqual(unseal(enc,key,id),{password:'secreto'});});
test('clave incorrecta rechazada',()=>assert.throws(()=>unseal(seal({},key,id),'cd'.repeat(32),id)));
test('cifrado vinculado al identificador',()=>assert.throws(()=>unseal(seal({},key,id),key,id+'x')));
test('configuración de cifrado ausente falla antes de crear',async()=>{const e=environment();await assert.rejects(()=>provision({...e,id,registro,key:''}));assert.equal(e.calls,0);assert.equal(e.job,null);});
test('fecha de reintento no cambia la huella',()=>{const r=structuredClone(registro);r.aceptacion.fechaHora='otro';assert.equal(fingerprint(r),fingerprint(registro));});
test('antecedentes cambiados cambian la huella',()=>assert.notEqual(fingerprint({...registro,empresa:'otra'}),fingerprint(registro)));
test('tres usuarios distintos con roles correctos',()=>{const a=accountsFor(id,registro);assert.equal(new Set(a.map(x=>x.email)).size,3);assert.deepEqual(a.map(x=>x.role),['company_admin','operator','operator']);assert.equal(new Set(a.map(x=>x.password)).size,3);});
test('alta completa sin secretos en respuesta',async()=>{const e=environment();const r=await run(e);assert.equal(e.users.length,3);assert.equal(r.estado,'creada');assert.ok(!JSON.stringify(r).includes('password'));assert.ok(e.users.every(u=>u.app_metadata.role==='pending_enrollment'));assert.equal(e.users[0].email,registro.representanteCorreo);});
test('reintento completado no recrea usuarios',async()=>{const e=environment();await run(e);await run(e);assert.equal(e.calls,3);assert.equal(e.finishCount,1);});
test('fallo de Auth y recuperación reutilizan solo cuentas propias',async()=>{const e=environment();e.failOn(3);await assert.rejects(()=>run(e));assert.equal(e.job.state,'failed');assert.equal(e.users[0].app_metadata.role,'pending_enrollment');await run(e);assert.equal(e.users.length,3);assert.equal(e.job.state,'completed');});
test('cuenta ajena nunca se reutiliza',async()=>{const e=environment();const a=accountsFor(id,registro)[0];e.users.push({id:'other',email:a.email,app_metadata:{enrollment_id:'other'}});await assert.rejects(()=>ensureAccount(e.operational,a,id),/OWNERSHIP_CONFLICT/);assert.equal(e.users[0].app_metadata.enrollment_id,'other');});
test('concurrencia del modelo concede un solo trabajador',async()=>{const e=environment();const r=await Promise.all([run(e),run(e)]);assert.equal(e.users.length,3);assert.ok(r.some(x=>x.estado==='procesando'));});
test('misma solicitud con datos incompatibles no modifica usuarios',async()=>{const e=environment();await run(e);await assert.rejects(()=>provision({...e,id,registro:{...registro,empresa:'otra'},key}));assert.equal(e.calls,3);});
test('correo fallido conserva cifrado y no repite alta',async()=>{const e=environment();await run(e);const sent=await deliverCredentials({...e,id,key,send:async()=>{throw Error('simulado');}});assert.equal(sent,'pendiente');assert.ok(e.job.credentials);assert.equal(e.job.state,'completed');});
test('entrega exitosa borra claves cifradas y no reenvía',async()=>{const e=environment();await run(e);let n=0;const send=async input=>{n++;assert.equal(input.para,registro.correo);assert.deepEqual(input.bcc,[]);};assert.equal(await deliverCredentials({...e,id,key,send}),'enviada');assert.equal(e.job.credentials,null);assert.equal(await deliverCredentials({...e,id,key,send}),'enviada');assert.equal(n,1);});

// PIN mode never sends the four-digit credential as an Auth password.
test('alta PIN registra tres verificadores sin password en createUser',async()=>{
 const e=environment(),registered=[],inputs=[];
 const create=e.operational.auth.admin.createUser;
 e.operational.auth.admin.createUser=async input=>{inputs.push(input);return create(input);};
 await provision({...e,id,registro,key,pinStore:{register:async(account,userId,enrollmentId)=>{assert.match(account.password,/^\d{4}$/);assert.equal(enrollmentId,id);registered.push(userId);}}});
 assert.equal(registered.length,3);assert.ok(inputs.every(input=>!('password' in input)));
 assert.ok(inputs.every(input=>input.app_metadata.credential_scheme==='qa_pin_v1'));
});
test('fallo al registrar PIN deja alta recuperable sin duplicar usuarios',async()=>{
 const e=environment();let fail=true;const pinStore={register:async()=>{if(fail){fail=false;throw Error('simulated');}}};
 await assert.rejects(()=>provision({...e,id,registro,key,pinStore}));
 assert.equal(e.job.state,'failed');await provision({...e,id,registro,key,pinStore});
 assert.equal(e.users.length,3);assert.equal(e.job.state,'completed');
});
