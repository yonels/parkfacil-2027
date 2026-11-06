import "server-only";
import { NextResponse } from "next/server";
import { remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { CompanyServiceError } from "@/lib/billing/companyServicesCore.mjs";

// Respuesta de error común de «Servicios a facturar» (SOL-2026-11-05-005, F1.2).
export function companyServiceFailure(request, auth, error, fallback, code) {
  if (error instanceof CompanyServiceError) return NextResponse.json({ error: error.message, code: error.code, field: error.field }, { status: error.status });
  return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: fallback, code: error.code || code }, { status: 500 });
}
