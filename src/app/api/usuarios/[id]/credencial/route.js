import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requireCompanyResource, requirePermission, requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS } from "@/lib/auth/permissions.mjs";
import { validateDirectPassword } from "@/lib/userCredentialCore.mjs";

function createTemporaryPassword() {
  return `Pf!${randomBytes(9).toString("base64url")}9a`;
}

export async function POST(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePermission(authorization.context, PERMISSIONS.USER_CREDENTIALS_MANAGE); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  let payload = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Solicitud inválida.", code: "INVALID_JSON" }, { status: 400 });
    }
  }
  const directPassword = String(payload?.password || "");
  const isDirectChange = directPassword.length > 0;
  if (isDirectChange) {
    try { requirePlatformAdmin(authorization.context); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }
    const passwordErrors = validateDirectPassword(directPassword);
    if (passwordErrors.length) {
      return NextResponse.json({ error: passwordErrors[0], details: passwordErrors, code: "PASSWORD_POLICY_INVALID" }, { status: 400 });
    }
  }
  const { data: member, error: memberError } = await db
    .from("company_members")
    .select("user_id,company_id,role,status")
    .eq("user_id", id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }
  try { requireCompanyResource(authorization.context, member.company_id); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }
  if (!["company_admin", "operator"].includes(member.role)) {
    return NextResponse.json(
      { error: "La generación de claves está disponible para administradores de empresa y operadores.", code: "ROLE_NOT_SUPPORTED" },
      { status: 400 },
    );
  }
  const { data: authData, error: authError } = await db.auth.admin.getUserById(id);
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  const temporaryPassword = isDirectChange ? directPassword : createTemporaryPassword();
  const mustChangePassword = isDirectChange ? payload.mustChangePassword !== false : true;
  const updatedAuth = await db.auth.admin.updateUserById(id, {
    password: temporaryPassword,
    user_metadata: {
      ...(authData.user.user_metadata || {}),
      must_change_password: mustChangePassword,
    },
  });
  if (updatedAuth.error) {
    console.error("[users:credential:update-auth]", updatedAuth.error);
    return NextResponse.json({ error: "No fue posible generar la clave temporal.", code: "CREDENTIAL_UPDATE_FAILED" }, { status: 500 });
  }

  const updatedMember = await db
    .from("company_members")
    .update({ must_change_password: mustChangePassword, updated_at: new Date().toISOString() })
    .eq("user_id", id);
  if (updatedMember.error) {
    console.error("[users:credential:update-member]", updatedMember.error);
  }

  return NextResponse.json({
    data: {
      userId: id,
      username: authData.user.email,
      temporaryPassword,
      mustChangePassword,
      directChange: isDirectChange,
      warning: updatedMember.error ? "La clave cambió, pero su indicador de seguridad requiere revisión." : null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
