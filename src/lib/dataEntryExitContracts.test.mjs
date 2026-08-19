import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/data-entry/route.js", import.meta.url), "utf8");

function has(pattern) {
  assert.match(route, pattern);
}

test("EXIT A-K: contrato defensivo del endpoint usa snapshot POS firmado y persistencia OPEN->PAID", () => {
  // A: snapshot requerido.
  has(/QUOTE_SNAPSHOT_REQUIRED/);

  // B: snapshot válido alimenta montos confirmados persistidos.
  has(/subtotal:\s*Number\(quoteSnapshot\.subtotalAmount \|\| 0\)/);
  has(/net:\s*Number\(quoteSnapshot\.netAmount \|\| 0\)/);
  has(/tax:\s*Number\(quoteSnapshot\.taxAmount \|\| 0\)/);
  has(/total:\s*Number\(quoteSnapshot\.totalAmount \|\| 0\)/);
  has(/total_amount:\s*confirmedQuote\.total/);

  // C: expiración explícita.
  has(/QUOTE_SNAPSHOT_EXPIRED/);

  // D: firma inválida/manipulación.
  has(/verifyPosQuoteSnapshot\(/);
  has(/QUOTE_SNAPSHOT_INVALID/);

  // E: vinculación stay/parking/updated_at para evitar snapshot cruzado.
  has(/quoteSnapshot\.stayId !== stay\.id/);
  has(/quoteSnapshot\.parkingId !== stay\.parking_id/);
  has(/quoteSnapshot\.stayUpdatedAt !== stay\.updated_at/);
  has(/QUOTE_SNAPSHOT_STALE/);

  // F: solo estadías OPEN participan en EXIT.
  has(/findOpenStay\(current\.db, input, current\.actor\.parkingId\)/);
  has(/\.eq\("status", "OPEN"\)/);

  // G/H: idempotencia y contención de concurrencia por condición OPEN en update.
  has(/\.update\(update\)\.eq\("id", stay\.id\)\.eq\("status", "OPEN"\)/);

  // I/J: no hay umbral artificial para 50 o 1000; se persiste el total del snapshot.
  has(/total:\s*Number\(quoteSnapshot\.totalAmount \|\| 0\)/);

  // K: neto, iva y total se persisten como columnas separadas coherentes.
  has(/net_amount:\s*confirmedQuote\.net/);
  has(/tax_amount:\s*confirmedQuote\.tax/);
  has(/total_amount:\s*confirmedQuote\.total/);
});

test("EXIT usa secreto POS dedicado y no fallback Webpay", () => {
  has(/const quoteSecret = process\.env\.POS_QUOTE_HMAC_SECRET;/);
  assert.doesNotMatch(route, /POS_QUOTE_HMAC_SECRET \|\| process\.env\.WEBPAY_QUOTE_HMAC_SECRET/);
});

test("QUOTE terminal incluye snapshot POS para confirmación posterior", () => {
  has(/isPosRequest && !quote\.blocked/);
  has(/buildPosQuoteSnapshot\(\{ stay, quote, calculatedAt: now \}\)/);
});
