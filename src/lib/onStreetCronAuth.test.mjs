import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authorizeCronRequest } from "./onStreetCronAuth.mjs";

test("cron rechaza configuración ausente sin exponer secretos",()=>{
  assert.deepEqual(authorizeCronRequest(null, ""),{ok:false,status:503,code:"CRON_NOT_CONFIGURED"});
});

test("cron rechaza secreto incorrecto",()=>{
  assert.deepEqual(authorizeCronRequest("Bearer incorrecto", "configurado"),{ok:false,status:401,code:"CRON_UNAUTHORIZED"});
});

test("cron acepta Authorization Bearer correcto",()=>{
  assert.deepEqual(authorizeCronRequest("Bearer configurado", "configurado"),{ok:true,status:200,code:null});
});

test("Vercel ejecuta cada minuto por GET sobre el procesador de SMS existente",async()=>{
  const config=JSON.parse(await readFile(new URL("../../vercel.json",import.meta.url),"utf8"));
  assert.deepEqual(config.crons.find(c=>c.path==="/api/internal/on-street-sms/process"),{path:"/api/internal/on-street-sms/process",schedule:"* * * * *"});
  const route=await readFile(new URL("../app/api/internal/on-street-sms/process/route.js",import.meta.url),"utf8");
  assert.match(route,/export async function GET/);
  assert.match(route,/processDueOnStreetSms/);
  assert.doesNotMatch(route,/CRON_SECRET[^\n]*(console|log)/);
});

test("Vercel ejecuta cada 2 minutos por GET sobre el reconciliador de pagos, sin desplazar el cron de SMS",async()=>{
  const config=JSON.parse(await readFile(new URL("../../vercel.json",import.meta.url),"utf8"));
  assert.equal(config.crons.length,2,"no debe eliminarse ni duplicarse ningún cron existente");
  assert.deepEqual(config.crons.find(c=>c.path==="/api/internal/on-street-payments/reconcile"),{path:"/api/internal/on-street-payments/reconcile",schedule:"*/2 * * * *"});
  const route=await readFile(new URL("../app/api/internal/on-street-payments/reconcile/route.js",import.meta.url),"utf8");
  const code=route.split("\n").filter((line)=>!line.trim().startsWith("//")).join("\n");
  assert.match(route,/export async function GET/);
  assert.match(route,/reconcileDueOnStreetPayments/);
  assert.doesNotMatch(route,/CRON_SECRET[^\n]*(console|log)/);
  assert.doesNotMatch(code,/PARKFACIL_INTERNAL_SERVICE_KEY/,"el cron server-to-server no debe reutilizar el secreto de operación manual");
});
