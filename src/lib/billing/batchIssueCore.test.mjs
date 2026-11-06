import test from "node:test";
import assert from "node:assert/strict";
import { batchSummary, MAX_BATCH_SIZE, stepsFor, validateBatchInput } from "./batchIssueCore.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("valida la selección: sin duplicados, máximo por lote y fecha", () => {
  assert.deepEqual(validateBatchInput({ ids: [id(1), id(1), id(2)], invoiceDate: "2026-11-06" }), { ids: [id(1), id(2)], invoiceDate: "2026-11-06" });
  assert.throws(() => validateBatchInput({ ids: [], invoiceDate: "2026-11-06" }), (e) => e.code === "BATCH_EMPTY");
  assert.throws(() => validateBatchInput({ ids: Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => id(i)), invoiceDate: "2026-11-06" }), (e) => e.code === "BATCH_TOO_LARGE");
  assert.throws(() => validateBatchInput({ ids: ["x"], invoiceDate: "2026-11-06" }), (e) => e.code === "BATCH_ID_INVALID");
  assert.throws(() => validateBatchInput({ ids: [id(1)], invoiceDate: "06-11-2026" }), (e) => e.code === "BATCH_DATE_INVALID");
});

test("pasos según estado: una prefactura calculada se revisa, aprueba, marca lista y emite", () => {
  assert.deepEqual(stepsFor("CALCULATED"), ["REVIEW", "APPROVE", "READY", "ISSUE"]);
  assert.deepEqual(stepsFor("APPROVED"), ["READY", "ISSUE"]);
  assert.deepEqual(stepsFor("READY_TO_ISSUE"), ["ISSUE"]);
  assert.throws(() => stepsFor("ISSUED"), (e) => e.code === "PREINVOICE_ALREADY_ISSUED");
  assert.throws(() => stepsFor("CANCELLED"), (e) => e.code === "PREINVOICE_CANCELLED");
});

test("resumen del lote", () => {
  assert.deepEqual(batchSummary([{ ok: true, documentStatus: "ISSUED" }, { ok: true, documentStatus: "PROVIDER_PENDING" }, { ok: false }]), { total: 3, issued: 1, pending: 1, failed: 1 });
});
