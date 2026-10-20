// Prueba local de la boleta del pago en efectivo (SOL-2026-10-20-001): base local
// + ambiente de DESARROLLO de Haulmer (CAF simulado). Requiere las filas de prueba
// emp-dte-test (RUT de la empresa de prueba de Haulmer) creadas en la base local.
//
// Uso: OPENFACTURA_TEST_API_KEY=<API Key pública de prueba> node --conditions=react-server --env-file=.env.local scripts/local-cash-boleta-e2e.mjs
// Nunca imprime la API Key, el token completo ni el TED completo.

import { createClient } from "@supabase/supabase-js";
import { encryptDteApiKey } from "../src/lib/boletaElectronica/dteSettingsCore.mjs";
import { issueCashPaymentBoleta } from "../src/lib/boletaElectronica/cashBoletaService.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error("Solo base local.");
const apiKey = process.env.OPENFACTURA_TEST_API_KEY || "";
if (!apiKey) throw new Error("Falta OPENFACTURA_TEST_API_KEY.");

const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMPANY = "emp-dte-test";
const PARKING = "dddddddd-0000-4000-8000-000000000001";
const STAY_OK = "dddddddd-0000-4000-8000-0000000000a1";
const STAY_FAIL = "dddddddd-0000-4000-8000-0000000000a2";
const fields = "id,code,parking_id,license_plate,status,exit_at,payment_method,payment_code,total_amount";
const summary = (boleta) => boleta && ({ status: boleta.status, environment: boleta.environment, folio: boleta.folio, resolution: boleta.resolution, net: boleta.netAmount, tax: boleta.taxAmount, total: boleta.totalAmount, tedLength: boleta.ted?.length || 0, tedStart: boleta.ted?.slice(0, 40) || null, stampBytes: boleta.stampPngBase64 ? Buffer.from(boleta.stampPngBase64, "base64").length : 0, errorCode: boleta.errorCode, message: boleta.message });

async function stay(id) {
  const { data, error } = await db.from("parking_stays").select(fields).eq("id", id).single();
  if (error) throw error;
  return data;
}

async function settings(key) {
  const { error } = await db.from("company_dte_settings").upsert({
    company_id: COMPANY, provider: "HAULMER", environment: "TEST",
    api_key_ciphertext: encryptDteApiKey(key), api_key_last4: key.slice(-4),
    enabled_parking_ids: [PARKING],
    emitter_business_name: "HAULMER SPA", emitter_activity: "VENTA AL POR MENOR EN EMPRESAS DE VENTA A DISTANCIA VIA INTERNET",
    emitter_address: "ARTURO PRAT 527   CURICO", emitter_commune: "Curicó", emitter_city: "Curicó",
    parking_branch_codes: { [PARKING]: "81303347" },
  }, { onConflict: "company_id" });
  if (error) throw error;
}

await settings(apiKey);
const first = await issueCashPaymentBoleta(db, await stay(STAY_OK));
console.log("1) emisión:", JSON.stringify(summary(first)));
const again = await issueCashPaymentBoleta(db, await stay(STAY_OK), { emit: async () => { throw new Error("no debía volver a emitir"); } });
console.log("2) repetir (desde la base, sin llamar a Haulmer):", JSON.stringify({ status: again?.status, folio: again?.folio }));
const card = await issueCashPaymentBoleta(db, { ...(await stay(STAY_OK)), id: STAY_FAIL, payment_method: "CARD" });
console.log("3) pago con tarjeta:", JSON.stringify(card));

await settings("clave-invalida-0000000000000000");
const failed = await issueCashPaymentBoleta(db, await stay(STAY_FAIL));
console.log("4) API Key inválida:", JSON.stringify(summary(failed)));

const docs = await db.from("parking_stay_dte_documents").select("stay_id,status,folio,error_code,attempts,idempotency_key").in("stay_id", [STAY_OK, STAY_FAIL]);
console.log("5) filas:", JSON.stringify(docs.data));
const paid = await db.from("parking_stays").select("id,status,payment_method,total_amount").in("id", [STAY_OK, STAY_FAIL]);
console.log("6) pagos intactos:", JSON.stringify(paid.data));
