import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { getCompanyServices } from "@/lib/billing/companyServicesRepository";
import { companyServiceFailure } from "../_shared";

export async function GET(request, { params }) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    const { companyId } = await params;
    return NextResponse.json({ data: await getCompanyServices(auth.db, companyId) });
  } catch (error) {
    return companyServiceFailure(request, auth, error, "No fue posible leer los servicios de la empresa.", "COMPANY_SERVICES_READ_FAILED");
  }
}
