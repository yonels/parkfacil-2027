import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getBillingDocument } from "@/lib/billing/documentRepository";
import { discardFailedDocument } from "@/lib/billing/documentJobRepository";

// «Descartar documento» (SOL-2026-11-05-005, 2026-11-08): solo rechazados o con error, sin folio ni token del proveedor
// (nunca existieron en el SII). La prefactura vuelve a «En revisión» para corregir y emitir de nuevo.
const MESSAGES = {
  DISCARD_REASON_REQUIRED: "Indique el motivo (al menos 5 caracteres).",
  DOCUMENT_DISCARD_INVALID: "Solo se pueden descartar documentos rechazados o con error de emisión.",
  DOCUMENT_HAS_PROVIDER_ID: "El proveedor asignó folio a este documento: puede existir en el SII y no se descarta. Anúlelo con una nota de crédito.",
  DOCUMENT_JOB_IN_PROGRESS: "La emisión está en proceso: espere a que termine.",
  DOCUMENT_NOT_FOUND: "Documento no encontrado.",
};

export async function POST(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_ISSUE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const document = await getBillingDocument(auth.db, { id, companyId: remainingCompanyScope(auth.context) });
    if (!document) return NextResponse.json({ error: MESSAGES.DOCUMENT_NOT_FOUND, code: "DOCUMENT_NOT_FOUND" }, { status: 404 });
    const data = await discardFailedDocument(auth.db, { companyId: document.company_id, documentId: id, actorId: auth.context.userId, reason: String(body.reason || "").slice(0, 300) });
    return NextResponse.json({ data });
  } catch (error) {
    const code = Object.keys(MESSAGES).find((key) => String(error.message || "").includes(key)) || error.code;
    if (MESSAGES[code]) return NextResponse.json({ error: MESSAGES[code], code }, { status: code === "DOCUMENT_NOT_FOUND" ? 404 : 422 });
    return NextResponse.json({ error: "No fue posible descartar el documento.", code: code || "DOCUMENT_DISCARD_FAILED" }, { status: 500 });
  }
}
