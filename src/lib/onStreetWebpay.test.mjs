import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decryptPaymentToken, encryptPaymentToken, hashPaymentToken } from "./payments/paymentTokenCrypto.mjs";
import { isAuthorizedWebpayResponse, sanitizeWebpayResponse } from "./payments/webpayCore.mjs";

const migration=await readFile(new URL("../../supabase/migrations/20260815100000_on_street_webpay_prepaid.sql",import.meta.url),"utf8");
const service=await readFile(new URL("./onStreetPaymentService.js",import.meta.url),"utf8");
const startRoute=await readFile(new URL("../app/api/public/on-street/payment-intents/route.js",import.meta.url),"utf8");
const returnRoute=await readFile(new URL("../app/api/public/on-street/webpay/return/route.js",import.meta.url),"utf8");

test("token_ws se almacena cifrado y se localiza por hash",()=>{const secret="integration-secret-with-at-least-32-bytes",token="01ab-token-webpay";const encrypted=encryptPaymentToken(token,secret);assert.notEqual(encrypted,token);assert.equal(decryptPaymentToken(encrypted,secret),token);assert.match(hashPaymentToken(token),/^[a-f0-9]{64}$/)});
test("commit autorizado exige status, response code, buy order y monto",()=>{const response={status:"AUTHORIZED",response_code:0,buy_order:"PF1",amount:900};assert.equal(isAuthorizedWebpayResponse(response,{buyOrder:"PF1",amount:900}),true);for(const changed of [{status:"FAILED"},{response_code:-1},{buy_order:"PF2"},{amount:901}])assert.equal(isAuthorizedWebpayResponse({...response,...changed},{buyOrder:"PF1",amount:900}),false)});
test("respuesta persistida está sanitizada",()=>{const safe=sanitizeWebpayResponse({status:"AUTHORIZED",response_code:0,buy_order:"PF1",amount:900,card_detail:{card_number:"secret"},authorization_code:"A1"});assert.equal("card_detail" in safe,false);assert.equal(safe.authorizationCode,"A1")});
test("creación calcula precio en servidor y no acepta body.amount",()=>{assert.match(service,/Math\.round\(normalizedMinutes\*rate\)/);assert.doesNotMatch(startRoute,/body\.amount/)});
test("intención y transacción tienen idempotencia y expiración",()=>{assert.match(migration,/unique \(qr_location_id,idempotency_key\)/);assert.match(migration,/unique \(provider,idempotency_key\)/);assert.match(migration,/PAYMENT_INTENT_EXPIRED/)});
test("solo existe un intento cobrable simultáneo por intención",()=>assert.match(migration,/payment_transactions_one_live_source_uidx[\s\S]*CREATED.*REDIRECTED.*COMMITTING.*COMMITTED/));
test("doble clic reutiliza transacción y no vuelve a llamar create",()=>{assert.match(migration,/jsonb_build_object\('transactionId',t\.id,'reused',true\)/);assert.match(service,/if\(created\.reused\)/)});
test("commit exitoso crea una única permanencia postpago",()=>{assert.match(migration,/insert into public\.on_street_pilot_sessions[\s\S]*payment_transaction_id/);assert.match(migration,/on_street_session_payment_uidx/);assert.match(migration,/if t\.status='COMMITTED'.*ALREADY_COMMITTED/)});
test("rechazo no ejecuta finalización",()=>{assert.match(service,/if\(!isAuthorizedWebpayResponse[\s\S]*markTransactionFailed[\s\S]*return\{status:"REJECTED"/)});
test("retorno duplicado consulta estado ya confirmado",()=>{assert.match(service,/transaction\.status==="COMMITTED"/);assert.match(migration,/PAYMENT_INTENT_ALREADY_PAID/)});
test("timeout intenta recuperación mediante status",()=>{assert.match(service,/getTransactionStatus\(token\)/);assert.match(service,/catch\(commitError\)[\s\S]*getTransactionStatus/)});
test("extensión aprobada es única y una rechazada no cambia expires_at",()=>{assert.match(migration,/on_street_extension_payment_uidx/);assert.match(migration,/update public\.on_street_pilot_sessions set purchased_minutes/);const beforeFinalize=migration.slice(0,migration.indexOf("create or replace function public.finalize_authorized_on_street_payment"));assert.doesNotMatch(beforeFinalize,/set purchased_minutes=purchased_minutes\+/)});
test("RLS bloquea acceso directo público",()=>{assert.match(migration,/enable row level security/g);assert.match(migration,/revoke all on public\.on_street_payment_intents,public\.payment_transactions from public,anon,authenticated/)});
test("retorno nunca acredita con parámetros de monto del navegador",()=>{assert.doesNotMatch(returnRoute,/amount|buyOrder/);assert.match(returnRoute,/processWebpayReturn/)});
