import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { sendDocumentEmail } from "@/lib/billing/documentEmailService";

// «Enviar por correo» (SOL-2026-11-05-005, F2): envía o reenvía el documento con su PDF aunque el envío automático
// esté apagado. En ambiente de pruebas va solo al correo del emisor.
export const maxDuration = 120;

export async function POST(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_ISSUE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    let query = auth.db.from("billing_documents").select("id").eq("id", id);
    const companyId = remainingCompanyScope(auth.context);
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Documento no encontrado.", code: "RESOURCE_NOT_FOUND" }, { status: 404 });
    const result = await sendDocumentEmail({ db: auth.db, documentId: id, force: true });
    if (result.status === "SENT") return NextResponse.json({ data: result });
    return NextResponse.json({ error: result.reason || "No fue posible enviar el correo.", code: `EMAIL_${result.status}`, data: result }, { status: 422 });
  } catch (error) {
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: error.message || "No fue posible enviar el correo.", code: "EMAIL_FAILED" }, { status: 500 });
  }
}
