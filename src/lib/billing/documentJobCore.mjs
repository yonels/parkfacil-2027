export const MAX_DOCUMENT_JOB_ATTEMPTS = 3;

export function sanitizeProviderError(error) {
  const code = String(error?.code || "PROVIDER_ERROR").replace(/[^A-Z0-9_]/gi, "_").slice(0, 120);
  const message = String(error?.message || "El proveedor no pudo procesar el documento.")
    .replace(/(?:password|secret|token|authorization|apikey)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .slice(0, 500);
  return { code, message, retryable: Boolean(error?.retryable) };
}

export function providerResultStatus(result = {}) {
  if (["ISSUED", "DUPLICATE"].includes(result.result)) return "ISSUED";
  if (result.result === "PENDING") return "PENDING";
  if (result.result === "REJECTED") return "REJECTED";
  return "ERROR";
}

export function canRetryDocument(document, job) {
  const maxAttempts = Number(job?.maxAttempts ?? job?.max_attempts);
  return ["ISSUING", "PROVIDER_PENDING", "ISSUE_ERROR"].includes(document?.status) &&
    ["RETRY", "FAILED"].includes(job?.status) && Number(job?.attempts) < maxAttempts;
}

export function jobOutcome({ result, retryable = false, attempts, maxAttempts }) {
  if (["ISSUED", "DUPLICATE"].includes(result)) return { jobStatus: "COMPLETED", documentStatus: "ISSUED" };
  if (result === "PENDING") return attempts < maxAttempts
    ? { jobStatus: "RETRY", documentStatus: "PROVIDER_PENDING" }
    : { jobStatus: "FAILED", documentStatus: "PROVIDER_PENDING" };
  if (retryable && attempts < maxAttempts) return { jobStatus: "RETRY", documentStatus: "ISSUE_ERROR" };
  return { jobStatus: "FAILED", documentStatus: result === "REJECTED" ? "PROVIDER_REJECTED" : "ISSUE_ERROR" };
}
