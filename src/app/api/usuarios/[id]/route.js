import { NextResponse } from "next/server";
import { authorizeApiRequest, authorizationErrorResponse } from "@/lib/auth/apiAuthorization";
import { requirePermission } from "@/lib/auth/apiAuthorizationCore.mjs";
import { PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { listAuthorizedUsers } from "@/lib/usersRepository";

export async function GET(request, { params }) {
  const authorization = await authorizeApiRequest(request);
  if (authorization.response) return authorization.response;
  try {
    requirePermission(authorization.context, PERMISSIONS.USERS_MANAGE);
  } catch (error) {
    return authorizationErrorResponse(request, error, authorization.context);
  }

  const { id } = await params;
  const db = getSupabaseAdminClient();
  const result = await listAuthorizedUsers(db, authorization.context);
  const user = result.data.find((item) => item.id === id) || null;

  if (!user) {
    return NextResponse.json({ error: "No se encontró el usuario solicitado.", code: "USER_NOT_FOUND" }, { status: 404 });
  }

  const company = result.companies.find((item) => item.id === user.empresaId) || null;
  const parkings = result.parkings.filter((item) => (user.estacionamientos || []).includes(item.id));

  return NextResponse.json({
    data: {
      user,
      company,
      parkings,
      canManageCredentials: [ROLES.PLATFORM_ADMIN, ROLES.COMPANY_ADMIN].includes(authorization.context.role),
      canSetDirectPassword: authorization.context.role === ROLES.PLATFORM_ADMIN && authorization.context.portal === "root",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
