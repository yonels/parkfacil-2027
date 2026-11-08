import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { CycleError } from "@/lib/billing/billingCycleCore.mjs";
import { runCycleBatch } from "@/lib/billing/billingCycleService";

// «Facturar en lote» del ciclo: de la etapa actual de cada empresa hasta la emisión. SOL-2026-11-05-005.
export const maxDuration = 300;

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_ISSUE);
  if (auth.response) return auth.response;
  try {
    requirePermission(auth.context, PERMISSIONS.BILLING_MANAGE);
    requirePermission(auth.context, PERMISSIONS.BILLING_REVIEW);
    requirePermission(auth.context, PERMISSIONS.BILLING_APPROVE);
    const body = await request.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(body.companyIds) ? body.companyIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (!ids.length) throw new CycleError("CYCLE_BATCH_EMPTY", "Seleccione al menos una empresa.");
    if (ids.length > 50) throw new CycleError("CYCLE_BATCH_TOO_LARGE", "Se pueden facturar hasta 50 empresas por lote.");
    const invoiceDate = String(body.invoiceDate || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) throw new CycleError("CYCLE_DATE_INVALID", "La fecha de emisión no es válida.");
    return NextResponse.json({ data: await runCycleBatch(auth.db, { companyIds: ids, period: String(body.period || ""), invoiceDate, actorId: auth.context.userId }) });
  } catch (error) {
    if (error instanceof CycleError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible facturar el lote.", code: error.code || "CYCLE_BATCH_FAILED" }, { status: 500 });
  }
}
