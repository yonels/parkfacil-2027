import "server-only";
import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/authenticatedContext";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { logDeniedAccess } from "@/lib/auth/accessDeniedLogger";

export async function authorizeApiRequest(request) {
  try {
    return { context: await getAuthenticatedContext(request), response: null };
  } catch (error) {
    return { context: null, response: authorizationErrorResponse(request, error) };
  }
}

export function authorizationErrorResponse(request, error, context = null) {
  const authError = error instanceof AuthorizationError
    ? error
    : new AuthorizationError("ACCESS_FORBIDDEN", 403, "No tienes permiso para realizar esta acción.", context);
  logDeniedAccess({ request, context, error: authError });
  return NextResponse.json({ error: authError.message, code: authError.code }, { status: authError.status });
}
