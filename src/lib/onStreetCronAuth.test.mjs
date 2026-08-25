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

test("Vercel ejecuta cada minuto por GET sobre el procesador existente",async()=>{
  const config=JSON.parse(await readFile(new URL("../../vercel.json",import.meta.url),"utf8"));
  assert.deepEqual(config.crons,[{path:"/api/internal/on-street-sms/process",schedule:"* * * * *"}]);
  const route=await readFile(new URL("../app/api/internal/on-street-sms/process/route.js",import.meta.url),"utf8");
  assert.match(route,/export async function GET/);
  assert.match(route,/processDueOnStreetSms/);
  assert.doesNotMatch(route,/CRON_SECRET[^\n]*(console|log)/);
});
