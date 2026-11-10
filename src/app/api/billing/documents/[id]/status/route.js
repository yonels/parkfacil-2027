import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getBillingDocument } from "@/lib/billing/documentRepository";
import { providerFor } from "@/lib/billing/providers/providerResolver";

// Estado de un documento ante el proveedor. SOL-2026-11-10-001 (H15): antes respondía siempre el estado guardado como
// «Mock». Ahora, si el documento se emitió con Haulmer, consulta el estado SII real, lo guarda en provider_status y lo
// audita; si se emitió en modo simulado, devuelve el estado guardado e indica que es simulado.
export async function POST(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_ISSUE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const doc = await getBillingDocument(auth.db, { id, companyId: remainingCompanyScope(auth.context) });
    if (!doc) return NextResponse.json({ error: "Documento no encontrado.", code: "RESOURCE_NOT_FOUND" }, { status: 404 });
    const simulated = doc.provider !== "haulmer" || !doc.provider_document_id;
    let status = doc.provider_status || doc.status;
    if (!simulated) {
      const provider = await providerFor(auth.db, "haulmer");
      const body = await provider.getDocument(doc.provider_document_id, "status");
      const sii = body?.estado || body?.status || null;
      if (sii) {
        status = `SII: ${sii}`.slice(0, 120);
        const update = await auth.db.from("billing_documents").update({ provider_status: status, updated_at: new Date().toISOString() }).eq("id", doc.id);
        if (update.error) throw update.error;
      }
    }
    const audit = await auth.db.from("billing_audit_events").insert({ company_id: doc.company_id, preinvoice_id: doc.preinvoice_id, action: "DOCUMENT_STATUS_REFRESHED", actor_id: auth.context.userId, new_value: { documentId: doc.id, provider: doc.provider, providerStatus: status, simulated } });
    if (audit.error) throw audit.error;
    return NextResponse.json({ data: { documentId: doc.id, status, provider: doc.provider, simulated } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "No fue posible consultar el estado del documento.", code: error.code || "DOCUMENT_STATUS_FAILED" }, { status: 502 });
  }
}
