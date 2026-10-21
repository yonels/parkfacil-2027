import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';
test('servidor local protege sesión, origen, CSRF, documentos y secretos',async()=>{
 const child=spawn(process.execPath,['--import','./tests/no-remote-network.mjs','web/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,QA_LOCAL_PORT:'14320',QA_CRM_URL:'https://yghhmhxqhjluldthvsse.supabase.co',QA_OPERATIONAL_URL:'https://pzpmioutzlnkbsssupip.supabase.co',QA_CRM_SERVICE_KEY:'sb_secret_FAKE_LOCAL_TEST',QA_OPERATIONAL_SERVICE_KEY:'sb_secret_FAKE_LOCAL_TEST',QA_ENCRYPTION_KEY:'a'.repeat(64),QA_MAIL_MODE:'simulated',QA_PAYMENT_MODE:'simulated'},stdio:['ignore','pipe','pipe']});
 const childExit=once(child,'exit');
 try{await Promise.race([once(child.stdout,'data'),childExit.then(()=>{throw Error('Servidor de pruebas salió antes de escuchar');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Servidor no inició')),8000).unref())]);
 const base='http://127.0.0.1:14320';let r=await fetch(base+'/');assert.equal(r.status,200);const html=await r.text();assert.ok(!html.includes('sb_secret_FAKE'));assert.equal(r.headers.get('cache-control'),'no-store');
 const cookie=r.headers.get('set-cookie').split(';')[0];r=await fetch(base+'/api/session',{headers:{cookie}});const session=await r.json();assert.equal(session.actor,null);assert.ok(session.csrf);
 r=await fetch(base+'/api/jobs',{headers:{cookie}});assert.equal(r.status,400);
 const post=(body,headers={})=>fetch(base+'/api/enroll',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-QA-CSRF':session.csrf,...headers},body:JSON.stringify(body)});
 r=await post({});assert.equal(r.status,400);assert.match((await r.json()).error,/no autorizada/);
 r=await post({requestId:'00000000-0000-4000-8000-000000000001'},{Origin:base});assert.equal(r.status,400);assert.match((await r.json()).error,/ambos PDF/);
 r=await fetch(base+'/documentos/condiciones-del-servicio-v0.2.pdf',{headers:{cookie}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/pdf');
 r=await fetch(base+'/api/action',{method:'POST',headers:{cookie,Origin:base,'Content-Type':'application/json','X-QA-CSRF':session.csrf},body:JSON.stringify({action:'activate',role:'root'})});assert.equal(r.status,400);assert.match((await r.json()).error,/Inicie sesión/);
 }finally{child.kill();await childExit;}
});

