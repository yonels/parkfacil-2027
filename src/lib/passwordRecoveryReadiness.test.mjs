import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryReadiness, resolveRecoveryRequest } from './passwordRecoveryReadiness.mjs';
const env = { NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture',PASSWORD_RECOVERY_DELIVERY:'microsoft',MICROSOFT_TENANT_ID:'fixture',MICROSOFT_CLIENT_ID:'fixture',MICROSOFT_CLIENT_SECRET:'secret-fixture',MICROSOFT_SENDER_EMAIL:'qa@example.cl'};
test('missing configuration blocks readiness without exposing values',()=>{
 assert.equal(recoveryReadiness(env).ok,true);
 for(const key of Object.keys(env)) { const result=recoveryReadiness({...env,[key]:''});assert.equal(result.ok,false,key);assert.ok(!JSON.stringify(result).includes('secret-fixture')); }
 assert.equal(recoveryReadiness({...env,PASSWORD_RECOVERY_DELIVERY:'mailpit'}).ok,false);
});
test('QA uses exact configured host and same-environment return URL',()=>{
 const preview={VERCEL_ENV:'preview',VERCEL_BRANCH_URL:'parkfacil-qa.vercel.app'};
 assert.deepEqual(resolveRecoveryRequest({host:'parkfacil-qa.vercel.app',env:preview}),{portal:'cliente',redirectTo:'https://parkfacil-qa.vercel.app/nueva-contrasena?portal=cliente'});
 assert.equal(resolveRecoveryRequest({host:'parkfacil-qa.vercel.app',requestedPortal:'root',env:preview}).portal,'root');
 for(const host of ['evil.vercel.app','parkfacil-qa.vercel.app.evil.cl','parkfacil-qa.vercel.app:443']) assert.equal(resolveRecoveryRequest({host,env:preview}).portal,null);
 assert.equal(resolveRecoveryRequest({host:'parkfacil-qa.vercel.app',env:{...preview,VERCEL_ENV:'production'}}).portal,null);
});
test('production host determines portal regardless of submitted portal',()=>{
 assert.deepEqual(resolveRecoveryRequest({host:'cliente.parkfacilapp.cl',requestedPortal:'root',env}),{portal:'cliente',redirectTo:'https://cliente.parkfacilapp.cl/nueva-contrasena'});
});

test('Next production build on Vercel blocks missing configuration, including direct next build', async()=>{
 const {default:configure}=await import('../../next.config.mjs');
 const prior=process.env.VERCEL;process.env.VERCEL='1';
 try { assert.throws(()=>configure('phase-production-build'),/access-readiness.*BLOCKED/);assert.ok(configure('phase-production-server')); }
 finally { if(prior===undefined) delete process.env.VERCEL;else process.env.VERCEL=prior; }
});
test('readiness endpoint restricts configuration details to authenticated Root',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../app/api/admin/access-readiness/route.js',import.meta.url),'utf8');
 assert.ok(source.indexOf('requirePlatformAdmin(auth.context)')<source.indexOf('const result = recoveryReadiness()'));
 assert.match(source,/deliveryVerified:false/);assert.match(source,/'Cache-Control':'no-store'/);
});
