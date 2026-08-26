import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = () => readFile(new URL("../../../supabase/migrations/20260812100000_billing_document_jobs.sql", import.meta.url), "utf8");

test("creación de documento y job es transaccional e idempotente", async () => { const sql = await migration(); assert.match(sql, /billing_enqueue_invoice/); assert.match(sql, /insert into public\.billing_documents[\s\S]*insert into public\.billing_document_jobs/); assert.match(sql, /unique \(document_id, operation\)/); assert.match(sql, /unique \(company_id, idempotency_key\)/); });
test("claim concurrente usa FOR UPDATE y token", async () => { const sql = await migration(); assert.match(sql, /billing_claim_document_job/); assert.match(sql, /for update/); assert.match(sql, /lock_token/); assert.match(sql, /status='PROCESSING'/); });
test("PENDING solo reintenta antes del máximo", async () => { const sql = await migration(); assert.match(sql, /p_result='PENDING' and j\.attempts<j\.max_attempts then final_job:='RETRY'/); assert.match(sql, /elsif p_result='PENDING' then final_job:='FAILED'; final_doc:='PROVIDER_PENDING'/); });
test("errores retryable solo reintentan antes del máximo", async () => { const sql = await migration(); assert.match(sql, /p_retryable and j\.attempts<j\.max_attempts then final_job:='RETRY'/); assert.match(sql, /else final_job:='FAILED'/); });
test("claim nunca incrementa sobre max_attempts", async () => { const sql = await migration(); assert.match(sql, /if j\.attempts>=j\.max_attempts then[\s\S]*status='FAILED'/); assert.match(sql, /DOCUMENT_JOB_ATTEMPTS_EXHAUSTED/); });
test("ISSUED no puede reencolarse", async () => { const sql = await migration(); assert.match(sql, /DOCUMENT_ALREADY_ISSUED/); });
test("jobs aíslan empresa, RLS y service role", async () => { const sql = await migration(); assert.match(sql, /company_id text not null references public\.companies/); assert.match(sql, /enable row level security/); assert.match(sql, /revoke all[\s\S]*public,anon,authenticated/); });
test("cada intento escribe auditoría", async () => { const sql = await migration(); assert.match(sql, /DOCUMENT_JOB_STARTED/); assert.match(sql, /DOCUMENT_JOB_RETRY/); assert.match(sql, /DOCUMENT_JOB_FAILED/); assert.match(sql, /DOCUMENT_JOB_COMPLETED/); });

test("los permisos se aplican dinámicamente a las cuatro funciones RPC", async () => {
  const sql = await migration();
  assert.match(sql, /do \$permissions\$[\s\S]*select p\.oid::regprocedure into strict rpc_identity[\s\S]*\$permissions\$;/i);
  const arities = {
    billing_enqueue_invoice: 14,
    billing_enqueue_existing_document: 3,
    billing_claim_document_job: 2,
    billing_finish_document_job: 12,
  };

  for (const [name, arity] of Object.entries(arities)) {
    assert.match(sql, new RegExp(`\\('${name}'\\s*,\\s*${arity}\\)`));
  }
  assert.match(sql, /execute format\('revoke all on function %s from public,anon,authenticated',rpc_identity\)/i);
  assert.match(sql, /execute format\('grant execute on function %s to service_role',rpc_identity\)/i);
});
