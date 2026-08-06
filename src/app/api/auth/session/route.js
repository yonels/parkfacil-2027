import { NextResponse } from "next/server";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { getAuthenticatedContext, SESSION_COOKIE } from "@/lib/auth/authenticatedContext";

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
    if (!accessToken) throw new AuthorizationError("AUTH_REQUIRED", 401, "Debes iniciar sesión.");
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    const authenticatedRequest = new Request(request.url, { headers });
    const context = await getAuthenticatedContext(authenticatedRequest);
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
