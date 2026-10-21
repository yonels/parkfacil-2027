import "server-only";
import { BillingServiceError } from "./BillingService.mjs";
import { BillingDocumentRepository } from "./billingDocumentRepository";
import { enqueueInvoice } from "./documentJobRepository";
import { processDocumentJob } from "./documentJobProcessor";

export async function enqueueAndProcessInvoice({ db, provider, ufRateService, preinvoiceId, invoiceDate, idempotencyKey, actorId }) {
  const preinvoice = await new BillingDocumentRepository(db).getReadyPreinvoice(preinvoiceId);
  if (!preinvoice || preinvoice.status !== "READY_TO_ISSUE") throw new BillingServiceError("PREINVOICE_NOT_READY", "La prefactura no está lista para emitir.");
  for (const [key, value] of Object.entries({ businessName: preinvoice.customer?.businessName, rut: preinvoice.customer?.rut, businessActivity: preinvoice.customer?.businessActivity, address: preinvoice.customer?.address, district: preinvoice.customer?.district, city: preinvoice.customer?.city, billingEmail: preinvoice.customer?.billingEmail })) if (!String(value || "").trim()) throw new BillingServiceError("FISCAL_DATA_MISSING", `Falta dato fiscal: ${key}.`);
  if (!preinvoice.lines?.length) throw new BillingServiceError("DOCUMENT_LINES_REQUIRED", "La prefactura no posee líneas.");
  if (preinvoice.lines.some(line => !line.taxCategory || line.taxCategory === "UNDEFINED")) throw new BillingServiceError("TAX_CLASSIFICATION_REQUIRED", "Existen conceptos sin clasificación tributaria.");
  let definitive = { currency: preinvoice.currency, net: preinvoice.netAmount, tax: preinvoice.taxAmount, total: preinvoice.totalAmount };
  if (preinvoice.currency === "UF") {
    let rate; try { rate = await ufRateService.getUfByDate(invoiceDate); } catch { throw new BillingServiceError("BCCH_UNAVAILABLE", "No fue posible obtener la UF definitiva.", { retryable: true }); }
    definitive = { ...definitive, ufReferenceDate: invoiceDate, ufValue: rate.value, ufSource: "Banco Central de Chile", amountUf: preinvoice.totalAmount, convertedAmountClp: Math.round(preinvoice.totalAmount * rate.value), currency: "CLP", total: Math.round(preinvoice.totalAmount * rate.value) };
  }
  const queued = await enqueueInvoice(db, { preinvoiceId, invoiceDate, idempotencyKey, actorId, definitive, customerSnapshot: preinvoice.customer });
  const processed = ["PENDING", "RETRY"].includes(queued.status) ? await processDocumentJob({ db, jobId: queued.jobId, actorId, provider }) : null;
  return { ...queued, processed };
}
