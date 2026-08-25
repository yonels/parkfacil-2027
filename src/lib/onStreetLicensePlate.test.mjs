import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service=await readFile(new URL("./onStreetPaymentService.js",import.meta.url),"utf8");
const start=await readFile(new URL("../components/on-street/PublicParkingStart.js",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/public/on-street/payment-intents/route.js",import.meta.url),"utf8");
const receipt=await readFile(new URL("../app/estacionar/comprobante/[token]/page.js",import.meta.url),"utf8");
const sessionRoute=await readFile(new URL("../app/api/public/on-street/sessions/[token]/route.js",import.meta.url),"utf8");
const sessionUi=await readFile(new URL("../components/on-street/PublicParkingSession.js",import.meta.url),"utf8");
const migration=await readFile(new URL("../../supabase/migrations/20260824160000_on_street_qr_license_plate.sql",import.meta.url),"utf8");

test("formulario exige y transporta patente antes de minutos",()=>{
  assert.match(start,/PATENTE DEL VEHÍCULO[\s\S]*required[\s\S]*¿Cuántos minutos/);
  assert.match(start,/JSON\.stringify\(\{ qrCode, licensePlate, phone, accepted, minutes \}\)/);
  assert.match(route,/licensePlate:body\.licensePlate/);
});

test("servicio reutiliza normalizePlate y rechaza patente ausente o inválida",()=>{
  assert.match(service,/import \{ normalizePlate \} from "\.\/dataEntry\.mjs"/);
  assert.match(service,/normalizePlate\(licensePlate,\{truncate:false\}\)/);
  assert.match(service,/\^\[A-Z0-9\]\{4,8\}\$/);
  assert.match(service,/PAYMENT_INTENT_INPUT_INVALID/);
});

test("intent persiste patente y Webpay la copia a la sesión ACTIVE",()=>{
  assert.match(service,/license_plate_normalized:normalizedPlate/);
  assert.match(migration,/i\.license_plate_normalized,i\.phone_normalized,'ACTIVE'/);
  assert.match(migration,/resulting_session_id=s\.id/);
});

test("migración conserva históricos sin inventar patente",()=>{
  assert.match(migration,/license_plate_normalized text null/);
  assert.match(migration,/license_plate_normalized is null or license_plate_normalized ~ '\^\[A-Z0-9\]\{4,8\}\$'/);
  assert.doesNotMatch(migration,/update public\.on_street_(payment_intents|pilot_sessions).*license_plate_normalized/is);
});

test("comprobante y consulta pública muestran patente sin ids internos",()=>{
  assert.match(receipt,/label="Patente"/);
  assert.match(sessionRoute,/licensePlate:data\.session\.license_plate_normalized/);
  assert.match(sessionUi,/<Box l="Patente"/);
});

test("extensión conserva patente, teléfono y sesión objetivo",()=>{
  assert.match(service,/license_plate_normalized:current\.session\.license_plate_normalized/);
  assert.match(service,/phone_normalized:current\.session\.phone_normalized/);
  assert.match(service,/target_session_id:current\.session\.id/);
  assert.match(migration,/PILOT_SESSION_IDENTITY_MISMATCH/);
});
