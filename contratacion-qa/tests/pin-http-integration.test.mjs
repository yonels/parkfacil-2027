import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {randomUUID} from 'node:crypto';import {CAMPOS_CONTRATACION,DOCUMENTOS_CONTRATACION} from '../web/formulario.mjs';
test('HTTP aislado: formulario, PIN, comercio, activación, permisos y desactivación',async()=>{
 const child=spawn(process.execPath,['--import','./tests/qa-transport-double.mjs','web/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,QA_LOCAL_PORT:'14321',QA_TEST_CLEANUP_FAIL:'true',QA_TEMPORARY_PIN_ENABLED:'true',QA_CRM_URL:'https://yghhmhxqhjluldthvsse.supabase.co',QA_OPERATIONAL_URL:'https://pzpmioutzlnkbsssupip.supabase.co',QA_CRM_SERVICE_KEY:'sb_secret_FAKE_LOCAL_TEST',QA_OPERATIONAL_SERVICE_KEY:'sb_secret_FAKE_LOCAL_TEST',QA_ENCRYPTION_KEY:'a'.repeat(64),QA_MAIL_MODE:'simulated',QA_PAYMENT_MODE:'simulated'},stdio:['ignore','pipe','pipe']});
 const exit=once(child,'exit');let timer;
 try{
 await Promise.race([once(child.stdout,'data'),exit.then(()=>{throw Error('Fixture server exited');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Fixture startup timeout')),8000);})]);clearTimeout(timer);
 const base='http://127.0.0.1:14321';let cookie='',csrf='';
 async function request(path,body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{cookie,Origin:base,'Content-Type':'application/json','X-QA-CSRF':csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const data=path.startsWith('/documentos/')?null:await r.json();return {status:r.status,data};}
 async function refresh(){const r=await request('/api/session');csrf=r.data.csrf;return r.data.actor;}
 async function login(email,password){await refresh();const r=await request('/api/login',{email,password});assert.equal(r.status,200,'login must succeed');return refresh();}
 const id=randomUUID(),body=Object.fromEntries(CAMPOS_CONTRATACION.map(([key])=>[key,'Dato ficticio']));
 Object.assign(body,{requestId:id,empresa:'EMPRESA LOCAL '+id,rut:'12.345.678-5',representanteRut:'12.345.678-5',correo:'local@example.invalid',representanteCorreo:'representante@example.invalid',planId:'start',plazas:50,aceptaCondiciones:true,lecturaPrivacidad:true,documentos:DOCUMENTOS_CONTRATACION});
 await refresh();for(const doc of DOCUMENTOS_CONTRATACION)assert.equal((await request(doc.url)).status,200);
 assert.equal((await request('/api/enroll',{...body,aceptaCondiciones:false})).status,400);assert.equal((await request('/api/enroll',{...body,giro:''})).status,400);
 const enrolls=await Promise.all([request('/api/enroll',body),request('/api/enroll',body)]);assert.ok(enrolls.every(r=>r.status===200));assert.equal((await request('/api/enroll',body)).data.estado,'creada');
 await login('root@example.invalid','local-root-test-only');
 let view=(await request('/api/view?id='+id)).data;assert.equal(view.members.length,3);assert.equal(view.company.status,'inactive');assert.equal(view.members.filter(x=>x.role==='company_admin').length,1);
 assert.equal((await request('/api/action',{id,action:'activate',reason:'Local test before requirements'})).status,400);
 const credentials=(await request('/api/credentials',{id})).data;assert.equal(credentials.length,3);for(const row of credentials)assert.match(row.password,/^\d{4}$/);
 const administrator=credentials.find(x=>x.role==='company_admin'),operator=credentials.find(x=>x.role==='operator');
 assert.equal((await request('/api/action',{id,action:'quote',revision:0,amount:150000,currency:'CLP',basis:'first_month',reference:'LOCAL-QUOTE'})).status,200);
 const foreignId=randomUUID();for(const doc of DOCUMENTOS_CONTRATACION)await request(doc.url);assert.equal((await request('/api/enroll',{...body,requestId:foreignId,empresa:'OTRA EMPRESA LOCAL',rut:'22.222.222-2',representanteCorreo:'representante2@example.invalid'})).status,200);
 await request('/api/logout',{});let actor=await login(administrator.user,administrator.password);assert.equal(actor.scope,'commercial');assert.equal(actor.mustChangePassword,true);
 assert.equal((await request('/api/credentials',{id})).status,400);
 assert.equal((await request('/api/operational')).status,400);assert.equal((await request('/api/action',{id,action:'accept',revision:1})).status,400);
 const changed=await request('/api/temporary-password',{currentPin:administrator.password,password:'personal-local-test-only',confirmPassword:'personal-local-test-only'});assert.equal(changed.status,200);assert.equal(changed.data.pendingState,true);
 await refresh();assert.equal((await request('/api/login',{email:administrator.user,password:administrator.password})).status,400);
 actor=await login(administrator.user,'personal-local-test-only');assert.equal(actor.mustChangePassword,false);
 assert.equal((await request('/api/action',{id,action:'accept',revision:1})).status,200);
 assert.equal((await request('/api/action',{id,action:'pay',revision:2,amount:150000,reference:'LOCAL-PAY'})).status,200);
 await request('/api/logout',{});await login('root@example.invalid','local-root-test-only');
 assert.equal((await request('/api/action',{id,action:'verify',revision:3})).status,200);
 assert.equal((await request('/api/action',{id,action:'contract',revision:4,reference:'LOCAL-CONTRACT'})).status,200);
 view=(await request('/api/action',{id,action:'activate',reason:'Local test complete'})).data;assert.equal(view.company.status,'active');assert.match(view.mail.subject,/activada/);
 assert.equal((await request('/api/forgot-password',{email:administrator.user})).status,200);
 const recoveries=(await request('/api/recovery-requests')).data;assert.equal(recoveries.length,1);
 assert.equal((await request('/api/recovery-issue',{id:recoveries[0].id,identityConfirmed:false})).status,400);
 const issued=await request('/api/recovery-issue',{id:recoveries[0].id,identityConfirmed:true});assert.equal(issued.status,200);
 const token=new URL(issued.data.url).hash.slice('#recuperar='.length);
 assert.equal((await request('/api/recovery-complete',{token,password:'personal-local-test-only',confirmPassword:'personal-local-test-only'})).status,200);
 assert.equal((await request('/api/recovery-complete',{token,password:'personal-local-test-only',confirmPassword:'personal-local-test-only'})).status,400);
 await request('/api/logout',{});actor=await login(administrator.user,'personal-local-test-only');assert.equal(actor.scope,'operational');
 const adminPins=await request('/api/credentials',{id});assert.equal(adminPins.status,200);assert.equal(adminPins.data.length,2);assert.ok(adminPins.data.every(x=>x.role==='operator'&&/^\d{4}$/.test(x.password)));
 assert.equal((await request('/api/recovery-requests')).status,400);
 assert.equal((await request('/api/credentials',{id:foreignId})).status,400);
 assert.equal((await request('/api/view?id='+foreignId)).status,400);
 assert.equal((await request('/api/jobs')).data.length,1);
 const operational=await request('/api/operational?companyId=foreign');assert.equal(operational.status,200);assert.equal(operational.data.company.id,view.company.id);
 const adminCookie=cookie,adminCsrf=csrf;cookie='';csrf='';await login(operator.user,operator.password);
 assert.equal((await request('/api/temporary-password',{currentPin:operator.password,password:'operator-local-test-only',confirmPassword:'operator-local-test-only'})).status,200);
 await login(operator.user,'operator-local-test-only');assert.equal((await request('/api/credentials',{id})).status,400);assert.equal((await request('/api/operational')).status,400);assert.equal((await request('/api/jobs')).status,400);
 cookie=adminCookie;csrf=adminCsrf;
 // A separate Root browser session deactivates while the representative session remains.
 const savedCookie=cookie,savedCsrf=csrf;cookie='';csrf='';await login('root@example.invalid','local-root-test-only');
 const deactivated=await request('/api/action',{id,action:'deactivate',reason:'Local revoke existing session'});assert.equal(deactivated.status,200);assert.match(deactivated.data.mail.subject,/desactivada/);
 cookie=savedCookie;csrf=savedCsrf;assert.equal((await request('/api/operational')).status,400);assert.equal((await refresh()),null);
 await refresh();assert.equal((await request('/api/login',{email:operator.user,password:operator.password})).status,400);
 }finally{clearTimeout(timer);child.kill();await exit;}
});


