import test from 'node:test';import assert from 'node:assert/strict';
import {authorizeAccountEdit,accountInput,updateAccount} from '../web/account-access.mjs';
const members=[{user_id:'admin',role:'company_admin',status:'active'},{user_id:'op1',role:'operator',status:'active'},{user_id:'op2',role:'operator',status:'inactive'},{user_id:'otherAdmin',role:'company_admin',status:'active'}];
const ctx={actorId:'admin',company:{id:'company',status:'active'},members,targetId:'op1'};
for(const [name,changes] of [['operador no administra',{actorId:'op1'}],['otra empresa no es destino',{targetId:'foreign'}],['no edita otro administrador',{targetId:'otherAdmin'}],['empresa inactiva bloquea',{company:{status:'inactive'}}],['miembro inactivo bloquea',{members:members.map(m=>m.user_id==='admin'?{...m,status:'inactive'}:m)}]])test(name,()=>assert.throws(()=>authorizeAccountEdit({...ctx,...changes})));
const input={email:'op1@example.invalid',currentPassword:'current-secret',password:'new-secret-123',confirmPassword:'new-secret-123'};
test('rechaza discrepancia de clave y correo real en pruebas',()=>{assert.throws(()=>accountInput({...input,confirmPassword:'other'}));assert.throws(()=>accountInput({...input,email:'persona@gmail.com'}));assert.throws(()=>accountInput({...input,password:'1234',confirmPassword:'1234'}));});
test('reautenticación fallida no toca Auth',async()=>{let calls=0;await assert.rejects(()=>updateAccount({...ctx,input,admin:{getUserById:()=>{calls++;}},reauthenticate:async()=>false}));assert.equal(calls,0);});
test('guarda sobre ID existente, conserva metadata y no devuelve secretos',async()=>{
 let sent;
 const result=await updateAccount({...ctx,input,reauthenticate:async()=>true,admin:{getUserById:async()=>({data:{user:{id:'op1',email:'old@example.invalid',app_metadata:{enrollment_id:'enrollment',role:'operator'}}}}),updateUserById:async(id,attributes)=>{sent={id,attributes};return {data:{user:{id}}};}}});
 assert.equal(sent.id,'op1');assert.equal(sent.attributes.app_metadata.enrollment_id,'enrollment');assert.equal(sent.attributes.app_metadata.qa_credentials_changed,true);assert.equal(sent.attributes.password,input.password);assert.equal('status' in sent.attributes,false);assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(result.self,false);
});
test('fallo proveedor no devuelve éxito ni mensaje que exponga claves',async()=>{
 await assert.rejects(()=>updateAccount({...ctx,input,reauthenticate:async()=>true,admin:{getUserById:async()=>({data:{user:{id:'op1'}}}),updateUserById:async()=>({error:{message:input.password}})}}),e=>!e.message.includes(input.password));
});
test('no modifica una cuenta Root aunque tenga una membresía',async()=>{
 let called=false;await assert.rejects(()=>updateAccount({...ctx,input,reauthenticate:async()=>true,admin:{getUserById:async()=>({data:{user:{id:'op1',app_metadata:{role:'platform_admin'}}}}),updateUserById:()=>{called=true;}}}));assert.equal(called,false);
});
test('cambio propio exige reingresar y permite conservar clave',async()=>{
 const r=await updateAccount({...ctx,targetId:'admin',input:{...input,email:'admin.qa@example.invalid',password:'',confirmPassword:''},reauthenticate:async()=>true,admin:{getUserById:async()=>({data:{user:{id:'admin',email:'old@example.invalid'}}}),updateUserById:async(id,attributes)=>{assert.equal('password' in attributes,false);return {data:{user:{id}}};}}});assert.equal(r.self,true);
});

test('correo solo no deja cuenta PIN sin mecanismo de ingreso',async()=>{
 let changed=false;
 await assert.rejects(()=>updateAccount({...ctx,input:{...input,password:'',confirmPassword:''},reauthenticate:async()=>true,admin:{getUserById:async()=>({data:{user:{id:'op1',email:'old@example.invalid',app_metadata:{credential_scheme:'qa_pin_v1'}}}}),updateUserById:async()=>{changed=true;}}}));
 assert.equal(changed,false);
});

test('cambiar clave de operador conserva su correo de acceso existente',async()=>{const email='operador1.test@usuarios.parkfacil.cl';let saved;await updateAccount({...ctx,input:{...input,email},reauthenticate:async()=>true,admin:{getUserById:async()=>({data:{user:{id:'op1',email,app_metadata:{}}}}),updateUserById:async(id,attributes)=>{saved=attributes;return {data:{user:{id}}};}}});assert.equal(saved.email,email);assert.equal(saved.password,input.password);});
