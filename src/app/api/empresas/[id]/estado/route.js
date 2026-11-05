import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { validateCompanyStatusChange } from "@/lib/companyServiceStatus.mjs";

const headers = { "Cache-Control": "no-store" };
const KNOWN_ERRORS = {
  COMPANY_NOT_FOUND: [404, "No se encontró la empresa solicitada."],
  COMPANY_STATUS_NOT_MANAGEABLE: [409, "El estado de esta empresa no se puede cambiar desde aquí."],
  COMPANY_STATUS_UNCHANGED: [409, "La empresa ya tiene ese estado. Actualiza la página."],
};

async function rootOnly(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization;
  try { requirePlatformAdmin(authorization.context); return authorization; }
  catch (error) { return { response: authorizationErrorResponse(request, error, authorization.context) }; }
}

export async function GET(request, { params }) {
  const authorization = await rootOnly(request);
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const result = await getSupabaseAdminClient().from("company_status_events")
    .select("id,previous_status,new_status,reason_code,reason_detail,actor_email,created_at")
    .eq("company_id", id).order("created_at", { ascending: false }).limit(10);
  if (result.error) {
    console.error("[companies:status-history]", result.error);
    return NextResponse.json({ error: "No fue posible consultar el historial.", code: "COMPANY_STATUS_HISTORY_FAILED" }, { status: 500, headers });
  }
  return NextResponse.json({ data: result.data || [] }, { headers });
}

export async function POST(request, { params }) {
  const authorization = await rootOnly(request);
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const input = await request.json().catch(() => null);
  const change = validateCompanyStatusChange(input || {});
  if (change.error) return NextResponse.json({ error: change.error, code: "VALIDATION_ERROR" }, { status: 400, headers });

  const result = await getSupabaseAdminClient().rpc("set_company_service_status", {
    p_company_id: id,
    p_new_status: change.status,
    p_reason_code: change.reasonCode,
    p_reason_detail: change.reasonDetail,
    p_actor_id: authorization.context.userId,
    p_actor_email: authorization.context.email || null,
  });
  if (result.error) {
    const known = KNOWN_ERRORS[result.error.message];
    if (known) return NextResponse.json({ error: known[1], code: result.error.message }, { status: known[0], headers });
    console.error("[companies:status]", result.error);
    return NextResponse.json({ error: "No fue posible cambiar el estado de la empresa.", code: "COMPANY_STATUS_FAILED" }, { status: 500, headers });
  }
  return NextResponse.json({ data: { status: change.status, event: result.data } }, { headers });
}
