import { NextResponse } from "next/server";
import { authorizeRemainingRequest } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { listBillingCompanies } from "@/lib/billing/companyServicesRepository";
import { companyServiceFailure } from "./_shared";

export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ data: await listBillingCompanies(auth.db) });
  } catch (error) {
    return companyServiceFailure(request, auth, error, "No fue posible listar las empresas.", "COMPANY_SERVICES_LIST_FAILED");
  }
}
