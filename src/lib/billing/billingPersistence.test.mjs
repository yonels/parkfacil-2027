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
