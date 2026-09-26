import { NextResponse } from "next/server";
import { getAuthenticatedContext, SESSION_COOKIE } from "@/lib/auth/authenticatedContext";
import { AuthorizationError } from "@/lib/auth/contextCore.mjs";
import { canAccessPath, ROLES } from "@/lib/auth/permissions.mjs";
import { getRequestPortal } from "@/lib/auth/portal.mjs";

const PUBLIC_PATHS = new Set([
  "/login",
  "/pos/login",
  "/inspector/login",
  "/acceso-operador",
  "/recuperar-contrasena",
  "/nueva-contrasena",
  "/manifest.webmanifest",
  // Manifest propio de Inspectores (Etapa 2): un instalador de PWA lo pide
  // sin sesión, igual que el manifest global -- ver src/app/inspector/
  // manifest.webmanifest/route.js.
  "/inspector/manifest.webmanifest",
  "/sw.js",
]);

function isPosPath(pathname) {
  return pathname === "/pos" || pathname.startsWith("/pos/");
}

function isInspectorPath(pathname) {
  return pathname === "/inspector" || pathname.startsWith("/inspector/");
}

function loginRedirect(request) {
  const loginPath = isPosPath(request.nextUrl.pathname) ? "/pos/login" : isInspectorPath(request.nextUrl.pathname) ? "/inspector/login" : "/login";
  const url = new URL(loginPath, request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.redirect(url);
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

function forbidden(context) {
  // POS Entry/Exit — Fase 1: en el Terminal, "Volver al Terminal" (/pos)
  // devolvía a esta misma pantalla en bucle -- el operador no tenía salida.
  // Para el portal Terminal se ofrece volver al login POS (ingresar con otra
  // cuenta); el resto de portales conserva exactamente el enlace anterior.
  const isTerminal = context?.portal === "terminal";
  const exitLink = isTerminal
    ? `<a href="/pos/login" style="display:inline-block;margin-top:1rem;padding:.9rem 1.2rem;border-radius:.9rem;background:#455A64;color:white;font-weight:700;text-decoration:none">Ingresar con otra cuenta</a>`
    : `<a href="/pos">Volver al Terminal</a>`;
  return new NextResponse(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso denegado | ParkFacil</title><body style="font-family:system-ui;background:#f8fafc;color:#041e42;padding:3rem"><main style="max-width:42rem;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:1.5rem;padding:2rem"><h1>Acceso denegado</h1><p>Tu cuenta autenticada no tiene permiso para acceder a esta ruta desde el portal ${context?.portal === "client" ? "Cliente" : context?.portal === "terminal" ? "Terminal" : context?.portal === "inspector" ? "Inspectores" : "Root"}.</p>${exitLink}</main></body></html>`,
    { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

// POS Entry/Exit — Fase 1: el Terminal es exclusivo de operadores -- misma
// regla que ya exige el login POS (/api/auth/session, scope pos_operator).
// Sin esto, una sesión company_admin abierta en el Portal Cliente (misma
// cookie) podía abrir /pos directamente. Las APIs POS igualmente resuelven
// UNASSIGNED para no-operadores; esto evita mostrar un POS inutilizable.
function canOpenPosTerminal(context) {
  return context?.portal !== "terminal" || context?.role === ROLES.OPERATOR;
}

// Las pantallas del POS nunca deben quedar en caché del navegador (incluido
// el back/forward cache): tras cerrar sesión, "Atrás" no debe mostrar una
// pantalla operativa restaurada de memoria sin pasar otra vez por el proxy.
function allowPosPath(pathname) {
  const response = NextResponse.next();
  if (isPosPath(pathname)) response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

export async function proxy(request) {
  if (
    PUBLIC_PATHS.has(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/icons/") ||
    // POS Entry/Exit — Fase 2: librerías estáticas servidas desde public/
    // (OCR local de patentes). El worker del OCR se carga desde /vendor y
    // su portal no es /pos, así que sin esta excepción el proxy lo
    // rechazaría. No contiene datos ni rutas de la app.
    request.nextUrl.pathname.startsWith("/vendor/") ||
    request.nextUrl.pathname.startsWith("/estacionar/")
  ) return NextResponse.next();
  try {
    const context = await getAuthenticatedContext(request);
    if (!canAccessPath(context, request.nextUrl.pathname) || !canOpenPosTerminal(context)) return forbidden(context);
    return allowPosPath(request.nextUrl.pathname);
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) return loginRedirect(request);
    return forbidden({ portal: getRequestPortal(request) });
  }
}

export const config = {
  // "_next/webpack-hmr" (el WebSocket de Hot Module Reload en desarrollo)
  // NO estaba excluido: el patrón original solo excluía "_next/static" y
  // "_next/image", así que esta ruta SÍ pasaba por el proxy. Sin sesión
  // (cualquier visitante en /login, /recuperar-contrasena, etc.) eso
  // producía un 307 hacia /login para la propia conexión de HMR -- un
  // WebSocket no puede seguir una redirección HTTP, así que la conexión de
  // HMR fallaba en bucle. Next.js reacciona a eso recargando la página
  // completa una y otra vez, lo que impide que React llegue a hidratar:
  // cualquier <form> quedaba con su envío nativo (GET a la misma URL) en
  // vez del onSubmit/fetch de React -- causa raíz real de "el formulario
  // de recuperación no envía el POST" (y, en general, de cualquier
  // interacción poco fiable en localhost). Solo afecta a desarrollo: en
  // Producción esta ruta nunca se solicita (HMR no existe fuera de "next
  // dev"), así que excluirla aquí es un cambio seguro y sin efecto en
  // Producción.
  matcher: ["/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
