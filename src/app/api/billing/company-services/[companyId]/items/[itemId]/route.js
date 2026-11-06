import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { validateServiceItem } from "@/lib/billing/companyServicesCore.mjs";
import { deleteServiceItem, updateServiceItem } from "@/lib/billing/companyServicesRepository";
import { companyServiceFailure } from "../../../_shared";

export async function PATCH(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const { companyId, itemId } = await params;
    const values = validateServiceItem(await request.json(), { partial: true });
    return NextResponse.json({ data: await updateServiceItem(auth.db, companyId, itemId, values) });
  } catch (error) {
    return companyServiceFailure(request, auth, error, "No fue posible guardar el servicio.", "SERVICE_UPDATE_FAILED");
  }
}

export async function DELETE(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const { companyId, itemId } = await params;
    return NextResponse.json({ data: await deleteServiceItem(auth.db, companyId, itemId) });
  } catch (error) {
    return companyServiceFailure(request, auth, error, "No fue posible eliminar el servicio.", "SERVICE_DELETE_FAILED");
  }
}
