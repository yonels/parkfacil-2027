import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingAuthorizationError } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { CatalogValidationError, validateCatalogInput } from "@/lib/billing/catalogCore.mjs";
import { deleteCatalogItem, updateCatalogItem } from "@/lib/billing/catalogRepository";

function failure(request, auth, error, fallback, code) {
  if (error instanceof CatalogValidationError) return NextResponse.json({ error: error.message, code: error.code, field: error.field }, { status: error.status });
  return remainingAuthorizationError(request, auth.context, error) || NextResponse.json({ error: fallback, code: error.code || code }, { status: 500 });
}

export async function PATCH(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const values = validateCatalogInput(await request.json(), { partial: true });
    return NextResponse.json({ data: await updateCatalogItem(auth.db, id, values, auth.context.userId) });
  } catch (error) {
    return failure(request, auth, error, "No fue posible guardar el servicio o producto.", "CATALOG_UPDATE_FAILED");
  }
}

export async function DELETE(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    return NextResponse.json({ data: await deleteCatalogItem(auth.db, id) });
  } catch (error) {
    return failure(request, auth, error, "No fue posible eliminar el servicio o producto.", "CATALOG_DELETE_FAILED");
  }
}
