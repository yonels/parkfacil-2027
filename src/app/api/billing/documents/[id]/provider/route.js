import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { providerFor } from "@/lib/billing/providers/providerResolver";

// PDF y estado SII de un documento emitido con Haulmer (SOL-2026-11-05-005, F2).
// GET ?value=pdf → archivo PDF; GET ?value=status → { status } y se guarda en provider_status.
export async function GET(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const value = new URL(request.url).searchParams.get("value") === "status" ? "status" : "pdf";
    let query = auth.db.from("billing_documents").select("id,company_id,provider,provider_document_id,folio,document_type").eq("id", id);
    const companyId = remainingCompanyScope(auth.context);
    if (companyId) query = query.eq("company_id", companyId);
    const { data: document, error } = await query.maybeSingle();
    if (error) throw error;
    if (!document) return NextResponse.json({ error: "Documento no encontrado.", code: "RESOURCE_NOT_FOUND" }, { status: 404 });
    if (document.provider !== "haulmer" || !document.provider_document_id) return NextResponse.json({ error: "Este documento se emitió en modo simulado: no tiene PDF ni estado ante el SII.", code: "PROVIDER_NOT_AVAILABLE" }, { status: 422 });
    const provider = await providerFor(auth.db, "haulmer");
    const body = await provider.getDocument(document.provider_document_id, value);
    if (value === "status") {
      const status = body?.estado || body?.status || null; // dev-api responde { estado: "Aceptado" | "Pendiente" | "Rechazado" | "Aceptado con Reparo" }
      if (status) await auth.db.from("billing_documents").update({ provider_status: `SII: ${status}`.slice(0, 120), updated_at: new Date().toISOString() }).eq("id", document.id);
      return NextResponse.json({ data: { status } });
    }
    if (!body?.pdf) return NextResponse.json({ error: "Haulmer no entregó el PDF.", code: "PROVIDER_PDF_MISSING" }, { status: 502 });
    const name = `${document.document_type === "INVOICE" ? "factura" : document.document_type === "CREDIT_NOTE" ? "nota-credito" : "nota-debito"}-${document.folio || document.id}.pdf`;
    return new NextResponse(Buffer.from(String(body.pdf), "base64"), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "No fue posible consultar a Haulmer.", code: error.code || "PROVIDER_QUERY_FAILED" }, { status: 502 });
  }
}
