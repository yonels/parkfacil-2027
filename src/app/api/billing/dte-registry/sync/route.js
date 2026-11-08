import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { DteImportError } from "@/lib/billing/dteRegistryCore.mjs";
import { BillingProviderError } from "@/lib/billing/providers/BillingProviderAdapter.mjs";
import { syncHaulmerIssued } from "@/lib/billing/dteSyncService";

// «Sincronizar con Haulmer» a pedido (SOL-2026-11-05-005, F2b). La sincronización diaria usa /api/internal/billing/dte-sync.
export const maxDuration = 300;

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const valid = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : undefined);
    const data = await syncHaulmerIssued(auth.db, { from: valid(body.from), to: valid(body.to), actorId: auth.context.userId });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof DteImportError || error instanceof BillingProviderError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 502 });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible sincronizar con Haulmer.", code: error.code || "DTE_SYNC_FAILED" }, { status: 500 });
  }
}
