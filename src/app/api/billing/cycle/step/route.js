import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { CycleError, CYCLE_STEPS } from "@/lib/billing/billingCycleCore.mjs";
import { runCycleStep } from "@/lib/billing/billingCycleService";

// Ejecuta la etapa actual de una empresa (no se pueden saltar etapas). SOL-2026-11-05-005.
export const maxDuration = 120;
const EXTRA_PERMISSION = { aprobacion: [PERMISSIONS.BILLING_REVIEW, PERMISSIONS.BILLING_APPROVE], revision: [PERMISSIONS.BILLING_REVIEW], emision: [PERMISSIONS.BILLING_ISSUE], envio: [PERMISSIONS.BILLING_ISSUE] };

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const step = String(body.step || "");
    if (!CYCLE_STEPS.some((s) => s.key === step)) throw new CycleError("CYCLE_STEP_INVALID", "Etapa no válida.");
    for (const permission of EXTRA_PERMISSION[step] || []) requirePermission(auth.context, permission);
    const data = await runCycleStep(auth.db, { companyId: String(body.companyId || ""), period: String(body.period || ""), step, actorId: auth.context.userId, payload: body.payload || {}, invoiceDate: body.invoiceDate });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof CycleError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: error.message || "No fue posible completar la etapa.", code: error.code || "CYCLE_STEP_FAILED" }, { status: 422 });
  }
}
