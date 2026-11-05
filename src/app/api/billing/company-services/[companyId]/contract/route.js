import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { validateMinimalContract } from "@/lib/billing/companyServicesCore.mjs";
import { createMinimalContract } from "@/lib/billing/companyServicesRepository";
import { companyServiceFailure } from "../../_shared";

export async function POST(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_MANAGE);
  if (auth.response) return auth.response;
  try {
    const { companyId } = await params;
    const values = validateMinimalContract(await request.json());
    return NextResponse.json({ data: await createMinimalContract(auth.db, companyId, values, auth.context.userId) }, { status: 201 });
  } catch (error) {
    return companyServiceFailure(request, auth, error, "No fue posible crear el contrato.", "CONTRACT_CREATE_FAILED");
  }
}
