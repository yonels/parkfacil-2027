import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { providerFor } from "@/lib/billing/providers/providerResolver";

// PDF de un documento del registro traído desde Haulmer (SOL-2026-11-05-005, F2b). Los importados de EasyDoc o del
// SII no tienen PDF en ParkFacil: se consultan en el sistema que los emitió.
export async function GET(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const { data: row, error } = await auth.db.from("billing_dte_registry").select("id,dte_type,folio,provider_token").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: "Documento no encontrado.", code: "RESOURCE_NOT_FOUND" }, { status: 404 });
    if (!row.provider_token) return NextResponse.json({ error: "Este documento se emitió fuera de Haulmer (EasyDoc o SII): su PDF está en ese sistema.", code: "PDF_NOT_AVAILABLE" }, { status: 409 });
    const provider = await providerFor(auth.db, "haulmer");
    const body = await provider.getDocument(row.provider_token, "pdf");
    if (!body?.pdf) return NextResponse.json({ error: "Haulmer no entregó el PDF.", code: "PROVIDER_PDF_MISSING" }, { status: 502 });
    return new NextResponse(Buffer.from(String(body.pdf), "base64"), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="dte-${row.dte_type}-${row.folio}.pdf"`, "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "No fue posible consultar a Haulmer.", code: error.code || "PROVIDER_QUERY_FAILED" }, { status: 502 });
  }
}
