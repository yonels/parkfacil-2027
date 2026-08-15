import { NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { getAuthenticatedContext, SESSION_COOKIE } from "@/lib/auth/authenticatedContext";
import { getSupabaseAdminClient } from "@/lib/supabaseServer";
import { hasPermission, PERMISSIONS, ROLES } from "@/lib/auth/permissions.mjs";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

function publicContext(context) {
  return {
    userId: context.userId,
    email: context.email,
    portal: context.portal,
    role: context.role,
    companyId: context.companyId,
    membership: context.membership,
  };
}

function failure(error) {
  const status = error instanceof AuthorizationError ? error.status : 500;
  const code = error instanceof AuthorizationError ? error.code : "SESSION_FAILED";
  return NextResponse.json({ error: status === 500 ? "No fue posible validar la sesión." : error.message, code }, { status });
}

async function validatePosOperatorScope(context) {
  if (context.role !== ROLES.OPERATOR) {
    throw new AuthorizationError("POS_OPERATOR_REQUIRED", 403, "Solo operadores POS pueden acceder a esta ruta.");
  }
  if (!context.companyId) {
    throw new AuthorizationError("COMPANY_REQUIRED", 403, "No tienes una empresa activa para operar.");
  }
  if (!hasPermission(context.role, PERMISSIONS.OPERATIONS_USE)) {
    throw new AuthorizationError("PERMISSION_FORBIDDEN", 403, "Esta cuenta no tiene permisos operativos POS.");
  }

  const db = getSupabaseAdminClient();
  const assignmentResult = await db
    .from("company_member_parkings")
    .select("parking_id")
    .eq("user_id", context.userId)
    .limit(1);

  if (assignmentResult.error) {
    throw new AuthorizationError("PARKING_ASSIGNMENT_LOOKUP_FAILED", 500, "No fue posible validar la asignación de estacionamiento.");
  }
  if (!assignmentResult.data?.length) {
    throw new AuthorizationError("PARKING_ASSIGNMENT_REQUIRED", 403, "No tiene un estacionamiento asignado para operar.");
  }
}

export async function GET(request) {
  try {
    return NextResponse.json({ data: publicContext(await getAuthenticatedContext(request)) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const accessToken = String(body?.accessToken || "");
    const scope = String(body?.scope || "default");
    if (!accessToken) throw new AuthorizationError("AUTH_REQUIRED", 401, "Debes iniciar sesión.");
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    const authenticatedRequest = new Request(request.url, { headers });
    const context = await getAuthenticatedContext(authenticatedRequest);
    if (scope === "pos_operator") {
      await validatePosOperatorScope(context);
    }
    const response = NextResponse.json({ data: publicContext(context) });
    response.cookies.set(SESSION_COOKIE, accessToken, { ...COOKIE_OPTIONS, maxAge: 55 * 60 });
    return response;
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ data: { signedOut: true } });
  response.cookies.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
