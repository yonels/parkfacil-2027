import "server-only";
import { getBillingDocument } from "./documentRepository";
import { claimDocumentJob, finishDocumentJob } from "./documentJobRepository";
import { providerResultStatus, sanitizeProviderError } from "./documentJobCore.mjs";

function requestFrom(document) {
  return {
    idempotencyKey: document.idempotency_key, documentType: document.document_type,
    issueDate: document.invoice_date, currency: document.currency,
    issuer: { provider: document.provider }, customer: document.customer_snapshot,
    lines: document.lines.map(line => ({ description: line.description, quantity: Number(line.quantity), unitPrice: Number(line.unit_price), total: Number(line.subtotal), taxCategory: line.tax_category })),
    totals: { net: Number(document.net_amount), tax: Number(document.tax_amount), total: Number(document.total_amount) },
    reference: document.document_reference_id ? { documentId: document.document_reference_id } : null,
    reason: document.reason || null,
  };
}

export async function processDocumentJob({ db, jobId, actorId, provider }) {
  const claim = await claimDocumentJob(db, { jobId, actorId });
  if (!claim?.claimed) return claim;
  const document = await getBillingDocument(db, { id: claim.documentId, companyId: claim.companyId });
  if (!document) throw new Error("DOCUMENT_NOT_FOUND");
  try {
    const request = requestFrom(document);
    const method = document.document_type === "CREDIT_NOTE" ? "emitCreditNote" : document.document_type === "DEBIT_NOTE" ? "emitDebitNote" : "emitInvoice";
    const response = await provider[method](request);
    return finishDocumentJob(db, { jobId, lockToken: claim.lockToken, actorId, result: providerResultStatus(response), providerDocumentId: response.providerDocumentId, providerStatus: response.providerStatus || response.providerCode, folio: response.folio, pdfReference: response.pdfReference, xmlReference: response.xmlReference, retryable: Boolean(response.retryable) });
  } catch (error) {
    const safe = sanitizeProviderError(error);
    return finishDocumentJob(db, { jobId, lockToken: claim.lockToken, actorId, result: "ERROR", errorCode: safe.code, errorMessage: safe.message, retryable: safe.retryable });
  }
}
