import test from 'node:test';
import assert from 'node:assert/strict';
import {temporaryPin,pinVerifier,matchesPin,exchangeTemporaryPin} from '../web/temporary-pin.mjs';
import {welcomePreview} from '../web/welcome-preview.mjs';

test('generación criptográfica conserva exactamente cuatro caracteres',()=>{
 for(let i=0;i<200;i++)assert.match(temporaryPin(),/^\d{4}$/);
});
test('verificación conserva ceros iniciales y rechaza formatos alternativos',async()=>{
 const record=await pinVerifier('0007');
 assert.equal(await matchesPin('0007',record),true);
 for(const pin of [7,'7',' 0007','0007 ','00007','abcd'])assert.equal(await matchesPin(pin,record),false);
 assert.equal(await matchesPin('0007',null),false);
});
async function fixture(){
 const record={...await pinVerifier('0007'),userId:'account',enrollmentId:'enrollment',revision:1};
 let attempts=0,links=0;
 const access=async()=>({companyStatus:'active',memberStatus:'active',role:'company_admin'});
 const store={reserveAttempt:async email=>email==='qa@example.invalid'&&++attempts<=5?{...record}:null,confirm:async(userId,revision)=>{if(record.revision!==revision)return false;record.revision++;attempts=0;return true;}};
 const auth={admin:{generateLink:async input=>{assert.equal(input.type,'recovery');links++;return {data:{user:{id:'account'},properties:{hashed_token:'server-only-token'}}};}},verifyOtp:async input=>{assert.equal(input.type,'recovery');return {data:{user:{id:'account'},session:{access_token:'server-only-access',refresh_token:'never-return'}}};}};
 return {record,store,auth,access,email:'qa@example.invalid',pin:'0007',get links(){return links;}};
}
test('intercambio emite sesión sin contraseña Auth ni envío y permite reingreso temporal',async()=>{
 const f=await fixture();const result=await exchangeTemporaryPin(f);
 assert.equal(result.userId,'account');assert.equal(result.mustChangePassword,true);
 assert.equal('refreshToken' in result,false);assert.equal('pin' in result,false);
 await exchangeTemporaryPin(f);assert.equal(f.links,2);
});
test('límite persistente contratado con store bloquea sexto intento',async()=>{
 const f=await fixture();for(let i=0;i<5;i++)await assert.rejects(()=>exchangeTemporaryPin({...f,pin:'9999'}));
 await assert.rejects(()=>exchangeTemporaryPin(f));assert.equal(f.links,0);
});
test('empresa o miembro inactivo y rol ajeno no obtienen sesión',async()=>{
 for(const state of [{companyStatus:'inactive',memberStatus:'active',role:'company_admin'},{companyStatus:'active',memberStatus:'inactive',role:'company_admin'},{companyStatus:'active',memberStatus:'active',role:'platform_admin'},null]){
 const f=await fixture();await assert.rejects(()=>exchangeTemporaryPin({...f,access:async()=>state}));assert.equal(f.links,0);
 }
});
test('identidad ausente y clave errónea presentan el mismo error',async()=>{
 const f=await fixture();let first;
 try{await exchangeTemporaryPin({...f,email:'missing@example.invalid'});}catch(e){first=e.message;}
 await assert.rejects(()=>exchangeTemporaryPin({...f,pin:'9999'}),e=>e.message===first);
});
test('fallo proveedor no filtra token ni mensaje privado',async()=>{
 const f=await fixture(),original=f.auth.admin.generateLink;f.auth.admin.generateLink=async()=>{throw Error('private-provider-secret');};
 await assert.rejects(()=>exchangeTemporaryPin(f),e=>e.message==='No se pudo autorizar el acceso.');
 f.auth.admin.generateLink=original;await exchangeTemporaryPin(f);
});
test('concurrencia confirma una sola versión de la clave',async()=>{
 const f=await fixture();const result=await Promise.allSettled([exchangeTemporaryPin(f),exchangeTemporaryPin(f)]);
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.links,2);
});
test('token de otra identidad se rechaza',async()=>{
 const f=await fixture();f.auth.verifyOtp=async()=>({data:{user:{id:'foreign'},session:{access_token:'secret'}}});
 await assert.rejects(()=>exchangeTemporaryPin(f));
});
test('bienvenida refleja activo, pendiente, desactivado y estados parciales',()=>{
 const members=Array.from({length:3},()=>({status:'active'}));
 assert.match(welcomePreview({company:{status:'active'},members}).subject,/activada/);
 assert.match(welcomePreview({company:{status:'inactive'}}).body,/inactiva/);
 assert.match(welcomePreview({company:{status:'inactive'},previouslyActivated:true}).subject,/desactivada/);
 assert.match(welcomePreview({company:{status:'active'},members:[]}).body,/no se ha confirmado/);
});

import {accessScope,requireOperational} from '../web/access-scope.mjs';
test('acceso comercial previo no concede acceso operativo',async()=>{
 const f=await fixture();const state={companyStatus:'inactive',memberStatus:'inactive',role:'company_admin',everActivated:false};
 assert.equal(accessScope(state,{allowCommercial:true}),'commercial');
 assert.throws(()=>requireOperational({role:'client',scope:'commercial',accountRole:'company_admin'}));
 const result=await exchangeTemporaryPin({...f,access:async()=>state,allowCommercial:true});assert.equal(result.scope,'commercial');
});
test('desactivación bloquea incluso una sesión existente al reevaluar estados',()=>{
 const initial={companyStatus:'inactive',memberStatus:'inactive',role:'company_admin',everActivated:true};
 assert.throws(()=>accessScope(initial,{allowCommercial:true}));
 assert.throws(()=>accessScope({...initial,role:'operator',everActivated:false},{allowCommercial:true}));
});
test('solo administrador activo con clave personal accede a datos operativos',()=>{
 const actor={role:'client',scope:'operational',accountRole:'company_admin',companyId:'own'};
 assert.equal(requireOperational(actor),'own');
 assert.throws(()=>requireOperational({...actor,accountRole:'operator'}));
 assert.throws(()=>requireOperational({...actor,mustChangePassword:true}));
});

