import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("registro de pagos exige permiso y limita el company_id del usuario", async () => {
  const route = await read("../../app/api/billing/accounts/payments/route.js");
  assert.match(route, /PERMISSIONS\.BILLING_MANAGE/);
  assert.match(route, /remainingCompanyScope\(auth\.context\)/);
  assert.match(route, /body\.companyId!==scope/);
});

test("persistencia de pagos tiene idempotencia por empresa", async () => {
  const migration = await read("../../../supabase/migrations/20260810210000_billing_payments_integrity.sql");
  assert.match(migration, /unique index[\s\S]*\(company_id,idempotency_key\)/i);
  assert.match(migration, /movement_type='PAYMENT'/i);
  const repository = await read("./accountRepository.js");
  assert.match(repository, /error\?\.code==="23505"/);
  assert.match(repository, /\.eq\("company_id",p\.companyId\)/);
});

test("emision real queda encapsulada tras adaptador y usa Mock en esta etapa", async () => {
  const route = await read("../../app/api/billing/preinvoices/[id]/issue/route.js");
  assert.match(route, /PERMISSIONS\.BILLING_ISSUE/);
  assert.match(route, /new MockBillingProviderAdapter\(\)/);
  assert.doesNotMatch(route, /fetch\(/);
});

test("documentos emitidos generan movimientos para factura, NC y ND", async () => {
  const migration = await read("../../../supabase/migrations/20260810200000_billing_account_movements.sql");
  assert.match(migration, /\('INVOICE','DEBIT_NOTE'\)/);
  assert.match(migration, /movement_kind='CREDIT_NOTE'/);
  assert.match(migration, /billing_document_posts_account/);
});

test("guarda de empresa soporta records de tablas con columnas distintas", async () => {
  const migration = await read("../../../supabase/migrations/20260810220000_billing_company_guard_record_safety.sql");
  assert.match(migration, /to_jsonb\(new\)/i);
  assert.doesNotMatch(migration, /new\.parking_id/i);
});

test("Etapa 6 usa RPC atómica con locking, idempotencia, RLS y reverso", async()=>{const migration=await read("../../../supabase/migrations/20260811100000_billing_payment_applications.sql");assert.match(migration,/for update/gi);assert.match(migration,/unique \(company_id,idempotency_key\)/i);assert.match(migration,/enable row level security/i);assert.match(migration,/revoke all[\s\S]*anon,authenticated/i);assert.match(migration,/PAYMENT_APPLICATION_CREATED/);assert.match(migration,/PAYMENT_APPLICATION_REVERSED/);assert.match(migration,/APPLICATION_EXCEEDS_SOURCE_AVAILABLE/);assert.match(migration,/APPLICATION_EXCEEDS_DOCUMENT_BALANCE/);assert.match(migration,/APPLICATION_CURRENCY_MISMATCH/);});
test("APIs de aplicaciones conservan permisos y scope server-side",async()=>{const apply=await read("../../app/api/billing/accounts/payments/[paymentId]/applications/route.js"),reverse=await read("../../app/api/billing/accounts/payments/[paymentId]/applications/[applicationId]/reverse/route.js");for(const source of [apply,reverse]){assert.match(source,/PERMISSIONS\.BILLING_MANAGE/);assert.match(source,/remainingCompanyScope/);assert.doesNotMatch(source,/body\.companyId/);}});
