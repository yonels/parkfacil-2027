import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { validateServiceItem } from "@/lib/billing/companyServicesCore.mjs";
import { addServiceItem } from "@/lib/billing/companyServicesRepository";
import { companyServiceFailure } from "../../_shared";

export async function POST(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const { companyId } = await params;
    const values = validateServiceItem(await request.json());
    return NextResponse.json({ data: await addServiceItem(auth.db, companyId, values, auth.context.userId) }, { status: 201 });
  } catch (error) {
    return companyServiceFailure(request, auth, error, "No fue posible agregar el servicio.", "SERVICE_CREATE_FAILED");
  }
}
