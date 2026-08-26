import "server-only";

const fail = error => { if (error) throw Object.assign(new Error(error.message), { code: error.code }); };

export async function enqueueInvoice(db, input) {
  const r = await db.rpc("billing_enqueue_invoice", {
    p_preinvoice_id: input.preinvoiceId, p_invoice_date: input.invoiceDate,
    p_idempotency_key: input.idempotencyKey, p_actor_id: input.actorId,
    p_currency: input.definitive.amountUf ? "UF" : input.definitive.currency, p_net: input.definitive.net,
    p_tax: input.definitive.tax, p_total: input.definitive.amountUf || input.definitive.total,
    p_amount_uf: input.definitive.amountUf || null,
    p_uf_reference_date: input.definitive.ufReferenceDate || null,
    p_uf_value: input.definitive.ufValue || null, p_uf_source: input.definitive.ufSource || null,
    p_converted_amount_clp: input.definitive.convertedAmountClp || null,
    p_customer_snapshot: input.customerSnapshot || {},
  });
  fail(r.error); return r.data;
}

export async function enqueueExistingDocument(db, input) {
  const r = await db.rpc("billing_enqueue_existing_document", { p_company_id: input.companyId, p_document_id: input.documentId, p_actor_id: input.actorId });
  fail(r.error); return r.data;
}

export async function claimDocumentJob(db, input) {
  const r = await db.rpc("billing_claim_document_job", { p_job_id: input.jobId, p_actor_id: input.actorId });
  fail(r.error); return r.data;
}

export async function finishDocumentJob(db, input) {
  const r = await db.rpc("billing_finish_document_job", {
    p_job_id: input.jobId, p_lock_token: input.lockToken, p_actor_id: input.actorId,
    p_result: input.result, p_provider_document_id: input.providerDocumentId || null,
    p_provider_status: input.providerStatus || null, p_folio: input.folio || null,
    p_pdf_reference: input.pdfReference || null, p_xml_reference: input.xmlReference || null,
    p_error_code: input.errorCode || null, p_error_message: input.errorMessage || null,
    p_retryable: Boolean(input.retryable),
  });
  fail(r.error); return r.data;
}

export async function getDocumentJob(db, { documentId, companyId }) {
  let q = db.from("billing_document_jobs").select("*").eq("document_id", documentId).eq("operation", "ISSUE");
  if (companyId) q = q.eq("company_id", companyId);
  const r = await q.maybeSingle(); fail(r.error); return r.data;
}
