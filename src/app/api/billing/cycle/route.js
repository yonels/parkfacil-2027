import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { CycleError, periodOf } from "@/lib/billing/billingCycleCore.mjs";
import { getCycle } from "@/lib/billing/billingCycleService";

// Ciclo de facturación del período (SOL-2026-11-05-005): etapa de cada empresa cliente y embudo del mes.
export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const period = new URL(request.url).searchParams.get("period") || periodOf(new Date(Date.now() - 3 * 3600 * 1000));
    return NextResponse.json({ data: await getCycle(auth.db, period) });
  } catch (error) {
    if (error instanceof CycleError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible cargar el ciclo de facturación.", code: error.code || "CYCLE_READ_FAILED" }, { status: 500 });
  }
}
