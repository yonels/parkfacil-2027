import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getClientHistory } from "@/lib/billing/clientHistoryRepository";

// Historial del cliente (SOL-2026-11-05-005): facturas con sus notas, pagos, correos y SII, línea de tiempo y resumen.
export async function GET(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const { companyId } = await params;
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return NextResponse.json({ data: await getClientHistory(auth.db, String(companyId), { today }) });
  } catch (error) {
    if (error.code === "COMPANY_NOT_FOUND") return NextResponse.json({ error: error.message, code: error.code }, { status: 404 });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible cargar el historial del cliente.", code: error.code || "HISTORY_READ_FAILED" }, { status: 500 });
  }
}
