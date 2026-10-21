import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { resendCompanyEnrollment, CompanyEnrollmentResendError } from "@/lib/companyEnrollmentResendCore.mjs";

// Reenvío de enrolamiento (DECISIÓN APROBADA 2026-09-10): rota la clave de
// las cuentas iniciales (administrador + operadores) y reenvía el correo al
// contacto de la empresa. NUNCA recrea usuarios ni cambia user_id/username/
// rol/company_id -- ver companyEnrollmentResendCore.mjs (lógica real) y su
// test .local.e2e (prueba contra Supabase Auth real).
export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePlatformAdmin(authorization.context); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const { id } = await params;
  const db = getSupabaseAdminClient();

  try {
    const result = await resendCompanyEnrollment({ supabase: db, companyId: id, requestedBy: authorization.context.userId });
    return NextResponse.json(result, { status: result.enrollment.emailSent ? 200 : 502 });
  } catch (error) {
    if (error instanceof CompanyEnrollmentResendError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[empresas:enrolamiento:reenviar]", error);
    return NextResponse.json({ error: "No fue posible reenviar el enrolamiento.", code: "ENROLLMENT_RESEND_FAILED" }, { status: 500 });
  }
}
