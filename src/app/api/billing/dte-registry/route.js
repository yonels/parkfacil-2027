import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listImports, listIssuedDocuments } from "@/lib/billing/dteRegistryRepository";

// Documentos emitidos (SOL-2026-11-05-005, F2b): registro EasyDoc / SII / Haulmer + lo emitido por ParkFacil.
export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const filters = {};
    for (const key of ["dteType", "folio", "rut", "name", "from", "to", "source", "response"]) if (params[key]) filters[key] = String(params[key]).slice(0, 120);
    for (const key of ["from", "to"]) if (filters[key] && !/^\d{4}-\d{2}-\d{2}$/.test(filters[key])) delete filters[key];
    const [rows, imports] = await Promise.all([listIssuedDocuments(auth.db, filters), listImports(auth.db, 10)]);
    return NextResponse.json({ data: { rows, imports } });
  } catch (error) {
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible listar los documentos emitidos.", code: error.code || "DTE_LIST_FAILED" }, { status: 500 });
  }
}
