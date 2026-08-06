import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { listAuthorizedUsers } from "@/lib/usersRepository";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try { requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE); } catch (error) { return authorizationErrorResponse(request, error, authorization.context); }

  const db = getSupabaseAdminClient();
  try {
    const result = await listAuthorizedUsers(db, authorization.context);
    return NextResponse.json({
      ...result,
      canManageCredentials: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN].includes(authorization.context.role),
      persistent: true,
    });
  } catch (error) {
    console.error("[users:list]", error);
    return NextResponse.json({ error: "No fue posible obtener los usuarios.", code: "USERS_READ_FAILED" }, { status: 500 });
  }
}
