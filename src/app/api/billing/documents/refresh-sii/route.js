import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { providerFor } from "@/lib/billing/providers/providerResolver";

// Actualiza el estado SII de los documentos emitidos con Haulmer que aún no tienen respuesta final
// (SOL-2026-11-05-005, F2). Hasta 30 por vez, uno cada 0,4 s (límite de Haulmer 3/s).
export const maxDuration = 120;
const FINAL = /^SII: (Aceptado|Rechazado)/i;

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    let query = auth.db.from("billing_documents").select("id,folio,document_type,provider_document_id,provider_status").eq("provider", "haulmer").eq("status", "ISSUED").not("provider_document_id", "is", null).order("created_at", { ascending: false }).limit(60);
    const companyId = remainingCompanyScope(auth.context);
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) throw error;
    const pending = (data || []).filter((doc) => !FINAL.test(String(doc.provider_status || ""))).slice(0, 30);
    const provider = await providerFor(auth.db, "haulmer");
    const results = [];
    for (const [index, doc] of pending.entries()) {
      if (index) await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        const status = await provider.getDocumentStatus(doc.provider_document_id);
        if (status) await auth.db.from("billing_documents").update({ provider_status: `SII: ${status}`.slice(0, 120), updated_at: new Date().toISOString() }).eq("id", doc.id);
        results.push({ id: doc.id, folio: doc.folio, status: status || null });
      } catch (err) {
        results.push({ id: doc.id, folio: doc.folio, error: err.message || "Sin respuesta de Haulmer." });
      }
    }
    return NextResponse.json({ data: { checked: results.length, results } });
  } catch (error) {
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: error.message || "No fue posible actualizar los estados SII.", code: error.code || "SII_REFRESH_FAILED" }, { status: 500 });
  }
}
