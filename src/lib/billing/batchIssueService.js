import "server-only";
import { BATCH_PAUSE_MS, BatchIssueError, batchSummary, stepsFor } from "./batchIssueCore.mjs";
import { transitionPreinvoice } from "./billingWorkflowRepository";
import { emailIssuedDocument, enqueueAndProcessInvoice } from "./documentIssuanceService";
import { createBillingProvider } from "./providers/providerFactory.mjs";
import { UfRateService } from "./ufRateService";

// Facturación en lote (SOL-2026-11-05-005, F2). Procesa una prefactura a la vez (respeta el límite de Haulmer) y
// sigue con las demás si una falla. Cada prefactura usa su propia llave de idempotencia: repetir el lote no emite
// dos veces la misma factura.
const STEP = {
  REVIEW: { target: "UNDER_REVIEW", action: "REVIEW_STARTED" },
  APPROVE: { target: "APPROVED", action: "APPROVED" },
  READY: { target: "READY_TO_ISSUE", action: "MARKED_READY_TO_ISSUE" },
};

async function readPreinvoice(db, id) {
  const r = await db.from("billing_preinvoices").select("id,status,version,internal_number,period,companies(business_name)").eq("id", id).maybeSingle();
  if (r.error) throw r.error;
  if (!r.data) throw new BatchIssueError("PREINVOICE_NOT_FOUND", "La prefactura no existe.");
  const company = Array.isArray(r.data.companies) ? r.data.companies[0] : r.data.companies;
  return { ...r.data, companyName: company?.business_name || "" };
}

export async function issuePreinvoiceBatch({ db, ids, invoiceDate, actorId, batchId, scenario, ufRateService = new UfRateService() }) {
  const results = [];
  const startedAt = Date.now();
  for (const [index, id] of ids.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    let current = null;
    const warnings = [];
    try {
      current = await readPreinvoice(db, id);
      for (const step of stepsFor(current.status)) {
        if (step === "ISSUE") {
          const issued = await enqueueAndProcessInvoice({ db, provider: createBillingProvider({ scenario }), ufRateService, preinvoiceId: id, invoiceDate, idempotencyKey: `lote-${batchId}-${id}`, actorId });
          const documentId = issued.processed?.documentId || issued.documentId;
          const doc = documentId ? await db.from("billing_documents").select("status,folio,total_amount,provider,provider_status").eq("id", documentId).maybeSingle() : { data: null };
          const document = doc.data || {};
          results.push({ id, ok: true, prefactura: current.internal_number, empresa: current.companyName, documentId, documentStatus: document.status || issued.processed?.documentStatus || issued.status, folio: document.folio || null, total: document.total_amount == null ? null : Number(document.total_amount), proveedor: document.provider || null, detalle: document.provider_status || null, warnings });
          break;
        }
        const transition = await transitionPreinvoice(db, id, { ...STEP[step], actorId, expectedVersion: current.version, requestId: `lote-${batchId}-${id}-${step}` });
        current = { ...current, status: transition.status, version: transition.version };
        for (const warning of transition.warnings || []) warnings.push(warning.message);
      }
    } catch (error) {
      results.push({ id, ok: false, prefactura: current?.internal_number || null, empresa: current?.companyName || "", code: error.code || "BATCH_ITEM_FAILED", error: error.message || "No fue posible facturar esta prefactura.", warnings });
    }
  }
  // Correos al final del lote, con un límite de tiempo: los que no alcancen quedan para «Enviar por correo».
  for (const item of results) {
    if (!item.ok || item.documentStatus !== "ISSUED") continue;
    if (Date.now() - startedAt > 240000) { item.email = "PENDING"; continue; }
    const email = await emailIssuedDocument(db, item.documentId);
    item.email = email?.status || null;
    if (email?.status === "FAILED") item.emailError = email.reason;
  }
  return { batchId, invoiceDate, results, summary: batchSummary(results) };
}
