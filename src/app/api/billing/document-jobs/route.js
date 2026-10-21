import { NextResponse } from "next/server";
import { authorizeRemainingRequest, remainingCompanyScope } from "@/lib/auth/remainingAuthorization";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";

export async function GET(request) {
  const auth = await authorizeRemainingRequest(request, PERMISSIONS.BILLING_READ);
  if (auth.response) return auth.response;
  try {
    let query = auth.db.from("billing_document_jobs").select("id,company_id,document_id,status,attempts,max_attempts,next_attempt_at,last_attempt_at,error_code,error_message,updated_at").order("updated_at", { ascending: false });
    const companyId = remainingCompanyScope(auth.context);
    if (companyId) query = query.eq("company_id", companyId);
    const result = await query;
    if (result.error) throw result.error;
    return NextResponse.json({ data: result.data || [] });
  } catch (error) {
    return NextResponse.json({ error: "No fue posible consultar el procesamiento documental.", code: error.code || "DOCUMENT_JOBS_READ_FAILED" }, { status: 500 });
  }
}
