import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { BatchIssueError, validateBatchInput } from "@/lib/billing/batchIssueCore.mjs";
import { issuePreinvoiceBatch } from "@/lib/billing/batchIssueService";

// Facturación en lote (SOL-2026-11-05-005, F2). Revisa, aprueba, marca lista y emite cada prefactura seleccionada.
// Exige los permisos de todo el ciclo (hoy solo Root los tiene).
export const maxDuration = 300;

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_ISSUE);
  if (auth.response) return auth.response;
  try {
    requirePermission(auth.context, PERMISSIONS.BILLING_REVIEW);
    requirePermission(auth.context, PERMISSIONS.BILLING_APPROVE);
    const body = await request.json();
    const { ids, invoiceDate } = validateBatchInput(body);
    const batchId = String(request.headers.get("idempotency-key") || randomUUID()).replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || randomUUID();
    const data = await issuePreinvoiceBatch({ db: auth.db, ids, invoiceDate, actorId: auth.context.userId, batchId, scenario: body.providerScenario });
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof BatchIssueError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible facturar el lote.", code: error.code || "BATCH_ISSUE_FAILED" }, { status: 500 });
  }
}
