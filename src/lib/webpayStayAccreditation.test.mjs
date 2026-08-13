import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { accreditAuthorizedWebpayStay } from "./webpayStayAccreditation.js";
import { isInternalServiceKeyValid } from "./internalServiceAuth.mjs";

const input = {
  stayId: "11111111-1111-4111-8111-111111111111",
  quoteId: "22222222-2222-4222-8222-222222222222",
  buyOrder: "PF-ORDER-1",
  amount: 500,
};

function dbFor(rpcData = { success: true, result: "PAID", stayId: input.stayId, paymentCode: input.buyOrder }, rpcError = null) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: rpcData, error: rpcError };
    },
  };
}

test("acreditación envía únicamente hechos externos mínimos a la RPC", async () => {
  const db = dbFor();
  const result = await accreditAuthorizedWebpayStay(db, input);

  assert.equal(result.result, "PAID");
  assert.deepEqual(db.calls, [{
    name: "accredit_webpay_parking_stay",
    args: {
      p_stay_id: input.stayId,
      p_quote_id: input.quoteId,
      p_buy_order: input.buyOrder,
      p_amount: input.amount,
    },
  }]);
});

test("mismo buyOrder pagado responde éxito idempotente", async () => {
  const result = await accreditAuthorizedWebpayStay(
    dbFor({ success: true, result: "ALREADY_PAID", stayId: input.stayId, paymentCode: input.buyOrder }),
    input
  );
  assert.equal(result.result, "ALREADY_PAID");
});

for (const code of ["STAY_NOT_FOUND", "QUOTE_NOT_FOUND", "STALE_QUOTE", "PAYMENT_CONFLICT", "AMOUNT_MISMATCH", "INVALID_STATE"]) {
  test(`${code} se propaga sin considerar acreditado el pago`, async () => {
    const error = { message: `error raised: ${code}` };
    await assert.rejects(
      () => accreditAuthorizedWebpayStay(dbFor(null, error), input),
      (received) => received.code === code
    );
  });
}

test("resultado ambiguo nunca se considera éxito", async () => {
  await assert.rejects(
    () => accreditAuthorizedWebpayStay(dbFor(null), input),
    (error) => error.code === "AMBIGUOUS_RESULT"
  );
});

test("la migración bloquea, detecta concurrencia y nunca acepta el desglose desde el llamador", async () => {
  const route = await readFile(new URL("../app/api/pague-aqui/webpay/accredit/route.js", import.meta.url), "utf8");
  const service = await readFile(new URL("./webpayStayAccreditation.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../../supabase/migrations/20260813100000_webpay_stay_accreditation.sql", import.meta.url), "utf8");

  assert.match(route, /PARKFACIL_INTERNAL_SERVICE_KEY/);
  assert.match(route, /quoteId/);
  assert.match(migration, /where id=p_stay_id for update/);
  assert.match(migration, /v_stay\.updated_at is distinct from v_quote\.stay_updated_at/);
  assert.match(migration, /raise exception 'STALE_QUOTE'/);
  assert.match(migration, /p_amount<>v_quote\.total_amount/);
  assert.match(migration, /raise exception 'AMOUNT_MISMATCH'/);
  assert.match(migration, /v_stay\.payment_code=p_buy_order and v_stay\.total_amount=p_amount/);
  assert.match(migration, /raise exception 'PAYMENT_CONFLICT'/);
  assert.match(migration, /exit_at=v_quote\.calculated_at/);
  assert.match(migration, /elapsed_minutes=v_quote\.elapsed_minutes/);
  assert.match(migration, /subtotal_amount=v_quote\.subtotal_amount/);
  assert.match(migration, /net_amount=v_quote\.net_amount/);
  assert.match(migration, /tax_amount=v_quote\.tax_amount/);
  assert.doesNotMatch(service, /p_elapsed_minutes|p_rate_id|p_subtotal_amount|p_discount_amount|p_net_amount|p_tax_amount|p_total_amount/);
  assert.match(migration, /accredit_webpay_parking_stay\(p_stay_id uuid,p_quote_id uuid,p_buy_order text,p_amount integer\)/);
  assert.match(migration, /p_amount is null or p_amount<=0/);
  assert.match(migration, /p_amount<>v_quote\.total_amount/);
  assert.match(migration, /INVALID_QUOTE_EVIDENCE/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(migration, /extensions\.hmac/);
  assert.match(migration, /p_evidence text/);
});

test("snapshot impide persistir elapsed o desglose incoherentes y conserva el tiempo cotizado", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20260813100000_webpay_stay_accreditation.sql", import.meta.url), "utf8");

  assert.match(migration, /elapsed_minutes integer not null check \(elapsed_minutes >= 0\)/);
  assert.match(migration, /p_elapsed_minutes<>greatest\(0,floor\(extract\(epoch from \(p_calculated_at-v_stay\.entry_at\)\)\/60\)::integer\)/);
  assert.match(migration, /subtotal_amount - discount_amount = total_amount/);
  assert.match(migration, /net_amount \+ tax_amount = total_amount/);
  assert.match(migration, /p_subtotal_amount-p_discount_amount<>p_total_amount/);
  assert.match(migration, /p_net_amount\+p_tax_amount<>p_total_amount/);
  assert.match(migration, /calculated_at timestamptz not null/);
  assert.match(migration, /exit_at=v_quote\.calculated_at/);
});

test("snapshot valida versión de stay, tarifa y bloques antes de ser utilizable", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20260813100000_webpay_stay_accreditation.sql", import.meta.url), "utf8");

  assert.match(migration, /v_stay\.updated_at is distinct from p_stay_updated_at/);
  assert.match(migration, /v_rate\.updated_at is distinct from p_rate_updated_at/);
  assert.match(migration, /v_blocks is distinct from coalesce\(p_rate_blocks_snapshot/);
  assert.match(migration, /status<>'OPEN'/);
  assert.match(migration, /status<>'ACTIVE'/);
});

test("los permisos de las RPC se resuelven dinámicamente por nombre y aridad", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/20260813100000_webpay_stay_accreditation.sql", import.meta.url), "utf8");

  assert.match(migration, /do \$permissions\$[\s\S]*select p\.oid::regprocedure into strict rpc_identity[\s\S]*\$permissions\$;/i);
  assert.match(migration, /\('create_webpay_stay_quote'\s*,\s*15\)/);
  assert.match(migration, /\('accredit_webpay_parking_stay'\s*,\s*4\)/);
  assert.match(migration, /n\.nspname='public' and p\.proname=rpc\.name and p\.pronargs=rpc\.nargs/);
  assert.match(migration, /execute format\('revoke all on function %s from public,anon,authenticated',rpc_identity\)/i);
  assert.match(migration, /execute format\('grant execute on function %s to service_role',rpc_identity\)/i);
  assert.doesNotMatch(migration, /^revoke all on function public\.(?:create|accredit)_webpay_/im);
  assert.doesNotMatch(migration, /^grant execute on function public\.(?:create|accredit)_webpay_/im);
});

test("credencial interna inválida se rechaza", () => {
  assert.equal(isInternalServiceKeyValid("wrong-key", "correct-key"), false);
  assert.equal(isInternalServiceKeyValid("", "correct-key"), false);
  assert.equal(isInternalServiceKeyValid("correct-key", "correct-key"), true);
});
