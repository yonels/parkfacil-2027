import { NextResponse } from "next/server";
import { getAuthenticatedContext, SESSION_COOKIE } from "@/lib/auth/authenticatedContext";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { canAccessPath } from "@/lib/auth/permissions.mjs";

const PUBLIC_PATHS = new Set(["/login", "/recuperar-contrasena", "/nueva-contrasena"]);

function loginRedirect(request) {
  const url = new URL("/login", request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(url);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

function forbidden(context) {
  return new NextResponse(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Acceso denegado | ParkFacil</title><body style="font-family:system-ui;background:#f8fafc;color:#041e42;padding:3rem"><main style="max-width:42rem;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:1.5rem;padding:2rem"><h1>Acceso denegado</h1><p>Tu cuenta autenticada no tiene permiso para acceder a esta ruta desde el portal ${context?.portal === "client" ? "Cliente" : "Root"}.</p><a href="/">Volver al inicio</a></main></body></html>`,
    { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function proxy(request) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  try {
    const context = await getAuthenticatedContext(request);
    return canAccessPath(context, request.nextUrl.pathname) ? NextResponse.next() : forbidden(context);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) return loginRedirect(request);
    return forbidden({ portal: request.nextUrl.hostname.startsWith("cliente.") ? "client" : "root" });
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
