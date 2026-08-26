import test from "node:test";
import assert from "node:assert/strict";
import { canRetryDocument, jobOutcome, providerResultStatus, sanitizeProviderError } from "./documentJobCore.mjs";

test("clasifica resultados del provider", () => {
  assert.equal(providerResultStatus({ result: "ISSUED" }), "ISSUED");
  assert.equal(providerResultStatus({ result: "DUPLICATE" }), "ISSUED");
  assert.equal(providerResultStatus({ result: "PENDING" }), "PENDING");
  assert.equal(providerResultStatus({ result: "REJECTED" }), "REJECTED");
});

test("sanitiza secretos y conserva retryable", () => {
  const value = sanitizeProviderError({ code: "TIMEOUT", message: "token=abc password=xyz", retryable: true });
  assert.equal(value.retryable, true);
  assert.doesNotMatch(value.message, /abc|xyz/);
});

test("solo permite reintentar estados recuperables", () => {
  assert.equal(canRetryDocument({ status: "ISSUE_ERROR" }, { status: "FAILED", attempts: 1, max_attempts: 3 }), true);
  assert.equal(canRetryDocument({ status: "ISSUED" }, { status: "FAILED", attempts: 1, max_attempts: 3 }), false);
  assert.equal(canRetryDocument({ status: "ISSUE_ERROR" }, { status: "COMPLETED", attempts: 1, max_attempts: 3 }), false);
});

test("PENDING antes del máximo vuelve a RETRY", () => {
  assert.deepEqual(jobOutcome({ result: "PENDING", attempts: 2, maxAttempts: 3 }), { jobStatus: "RETRY", documentStatus: "PROVIDER_PENDING" });
});

test("PENDING al alcanzar el máximo termina el job sin inventar rechazo", () => {
  assert.deepEqual(jobOutcome({ result: "PENDING", attempts: 3, maxAttempts: 3 }), { jobStatus: "FAILED", documentStatus: "PROVIDER_PENDING" });
});

test("error retryable respeta estrictamente el máximo", () => {
  assert.deepEqual(jobOutcome({ result: "ERROR", retryable: true, attempts: 2, maxAttempts: 3 }), { jobStatus: "RETRY", documentStatus: "ISSUE_ERROR" });
  assert.deepEqual(jobOutcome({ result: "ERROR", retryable: true, attempts: 3, maxAttempts: 3 }), { jobStatus: "FAILED", documentStatus: "ISSUE_ERROR" });
});

test("un job agotado no ofrece otro reintento", () => {
  assert.equal(canRetryDocument({ status: "PROVIDER_PENDING" }, { status: "FAILED", attempts: 3, max_attempts: 3 }), false);
});
