import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { CatalogValidationError, validateCatalogInput } from "@/lib/billing/catalogCore.mjs";
import { createCatalogItem, listCatalog } from "@/lib/billing/catalogRepository";

// Catálogo de servicios y productos de ParkFacil (SOL-2026-11-05-005, F1.1). Solo Root tiene permisos de facturación.
export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await listCatalog(auth.db) });
  } catch (error) {
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible listar el catálogo.", code: error.code || "CATALOG_LIST_FAILED" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const values = validateCatalogInput(await request.json());
    return NextResponse.json({ data: await createCatalogItem(auth.db, values, auth.context.userId) }, { status: 201 });
  } catch (error) {
    if (error instanceof CatalogValidationError) return NextResponse.json({ error: error.message, code: error.code, field: error.field }, { status: error.status });
    return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: "No fue posible crear el servicio o producto.", code: error.code || "CATALOG_CREATE_FAILED" }, { status: 500 });
  }
}
