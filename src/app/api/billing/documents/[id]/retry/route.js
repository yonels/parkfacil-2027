import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getBillingDocument } from "@/lib/billing/documentRepository";
import { enqueueExistingDocument } from "@/lib/billing/documentJobRepository";
import { processDocumentJob } from "@/lib/billing/documentJobProcessor";
import { MockBillingProviderAdapter } from "@/lib/billing/providers/MockBillingProviderAdapter.mjs";

export async function POST(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_ISSUE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const document = await getBillingDocument(auth.db, { id, companyId: remainingCompanyScope(auth.context) });
    if (!document) return NextResponse.json({ error: "Documento no encontrado.", code: "RESOURCE_NOT_FOUND" }, { status: 404 });
    const queued = await enqueueExistingDocument(auth.db, { companyId: document.company_id, documentId: id, actorId: auth.context.userId });
    const processed = ["PENDING", "RETRY"].includes(queued.status) ? await processDocumentJob({ db: auth.db, jobId: queued.jobId, actorId: auth.context.userId, provider: new MockBillingProviderAdapter({ scenario: body.providerScenario || "success" }) }) : null;
    return NextResponse.json({ data: { ...queued, processed } }, { status: 202 });
  } catch (error) {
    const code = error.code || error.message || "DOCUMENT_RETRY_FAILED";
    return NextResponse.json({ error: code === "DOCUMENT_ALREADY_ISSUED" ? "El documento ya fue emitido y no puede reprocesarse." : "No fue posible reintentar la emisión.", code }, { status: code === "DOCUMENT_ALREADY_ISSUED" ? 409 : 422 });
  }
}
