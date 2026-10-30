import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { loadCompanySetupOverview } from "@/lib/companySetup/companySetupServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";

// «Configurar empresa» (SOL-2026-10-29-014, fase 1): diagnóstico de solo
// lectura de los 7 pasos de cada cuenta. Exclusivo de Root; no escribe nada.
export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePlatformAdmin(authorization.context);
    return NextResponse.json({ data: await loadCompanySetupOverview(getSupabaseAdminClient()) });
  } catch (error) {
    if (error?.status) return authorizationErrorResponse(request, error, authorization.context);
    console.error("[company-setup:overview]", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "No fue posible cargar el estado de configuración de las empresas.", code: "COMPANY_SETUP_READ_FAILED" }, { status: 500 });
  }
}
