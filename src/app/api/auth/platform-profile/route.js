import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePlatformAdmin } from "@/lib/auth/apiAuthorizationCore.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { assertSelfPlatformAdmin, normalizePlatformAdminProfileInput } from "@/lib/platformAdminProfileCore.mjs";

export const dynamic = "force-dynamic";

async function loadAuthorizedRoot(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return { response: authorization.response };
  try {
    requirePlatformAdmin(authorization.context);
  } catch (error) {
    return { response: authorizationErrorResponse(request, error, authorization.context) };
  }

  const db = getSupabaseAdminClient();
  const authResult = await db.auth.admin.getUserById(authorization.context.userId);
  const verification = assertSelfPlatformAdmin({ context: authorization.context, targetUser: authResult.data?.user });
  if (authResult.error || !verification.ok) {
    return {
      response: NextResponse.json(
        { error: "No se encontró el perfil Root solicitado.", code: verification.code || "ROOT_PROFILE_NOT_FOUND" },
        { status: verification.status || 404 },
      ),
    };
  }
  return { db, context: authorization.context, user: authResult.data.user };
}

export async function GET(request) {
  const authorized = await loadAuthorizedRoot(request);
  if (authorized.response) return authorized.response;

  const result = await authorized.db
    .from("platform_admin_profiles")
    .select("user_id,recovery_email")
    .eq("user_id", authorized.context.userId)
    .maybeSingle();
  if (result.error) {
    return NextResponse.json({ error: "No fue posible cargar Mi cuenta.", code: "ROOT_PROFILE_READ_FAILED" }, { status: 500 });
  }
  return NextResponse.json({
    data: {
      userId: authorized.context.userId,
      loginIdentifier: authorized.user.email,
      recoveryEmail: result.data?.recovery_email || null,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request) {
  const authorized = await loadAuthorizedRoot(request);
  if (authorized.response) return authorized.response;

  const input = await request.json().catch(() => null);
  const normalized = normalizePlatformAdminProfileInput(input);
  if (normalized.error) {
    return NextResponse.json({ error: normalized.error, code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const result = await authorized.db.from("platform_admin_profiles").upsert({
    user_id: authorized.context.userId,
    recovery_email: normalized.recoveryEmail,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (result.error) {
    return NextResponse.json({ error: "No fue posible guardar el correo de recuperación.", code: "ROOT_PROFILE_UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ data: { recoveryEmail: normalized.recoveryEmail } }, { headers: { "Cache-Control": "no-store" } });
}
