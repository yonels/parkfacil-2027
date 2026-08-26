// DIAGNÓSTICO MANUAL — NO es parte de la suite automática de tests.
//
// Este script NO debe vivir con extensión ".test.mjs" ni dentro de un
// directorio "test"/"tests": `npm test` (node --test) descubre archivos
// automáticamente por ese patrón, y este script se conecta a Supabase REAL
// (no local, no mock) usando SUPABASE_SERVICE_ROLE_KEY leída de .env.local,
// además de apuntar a un STAY_ID hardcodeado de un caso puntual (CXPY93).
// Ejecutarlo sin querer como parte de `npm test` en cualquier máquina o CI
// fallaría (falta .env.local) o, peor, golpearía datos reales.
//
// Uso manual explícito, nunca automático:
//   node scripts/diagnostics/parkingStayQuote.cxp93.readonly.mjs
//
// Es de solo lectura: quoteParkingStayById no escribe en la base de datos.
// No expone secretos: la key se lee de .env.local (nunca hardcodeada) y no
// se imprime en ningún log.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { quoteParkingStayById } from "../../src/lib/parkingStayQuoteService.js";

const STAY_ID = "76d16d17-89cb-4d5b-a235-9f736aa872b1";

function getEnvFromLocalFile(name) {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  const match = text.match(new RegExp(`^${name}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

async function main() {
  const url = getEnvFromLocalFile("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnvFromLocalFile("SUPABASE_SERVICE_ROLE_KEY");

  assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL debe estar definido en .env.local");
  assert.ok(key, "SUPABASE_SERVICE_ROLE_KEY debe estar definido en .env.local");

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const result = await quoteParkingStayById(db, STAY_ID, { now: new Date() });

  const summary = result.ok
    ? {
      found: true,
      entry_at: result.quote.entryAt,
      calculated_at: result.quote.calculatedAt,
      elapsed_minutes: result.quote.elapsedMinutes,
      billable_minutes: result.quote.billableMinutes,
      rate_id: result.quote.rateId,
      rate_name: result.quote.rateName,
      billing_mode: result.quote.billingMode,
      amount: result.quote.amount,
      currency: result.quote.currency,
      payable: result.quote.payable,
      blocked_reason: result.quote.blockedReason,
    }
    : {
      found: false,
      entry_at: null,
      calculated_at: null,
      elapsed_minutes: null,
      billable_minutes: null,
      rate_id: null,
      rate_name: null,
      billing_mode: null,
      amount: null,
      currency: null,
      payable: false,
      blocked_reason: result.code,
    };

  console.log("CXPY93_QUOTE_SUMMARY=" + JSON.stringify(summary));

  assert.equal(summary.found, true);
  assert.ok(Number.isFinite(summary.elapsed_minutes) && summary.elapsed_minutes > 0);
  assert.equal(summary.amount, null);
  assert.equal(summary.payable, false);
  assert.equal(summary.blocked_reason, "NO_ACTIVE_RATE");

  console.log("CXPY93: diagnóstico OK");
}

main().catch((error) => {
  console.error("CXPY93: diagnóstico FALLÓ:", error.message);
  process.exitCode = 1;
});
