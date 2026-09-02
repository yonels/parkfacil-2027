import { POS_FRONTEND_VERSION } from "@/lib/frontendVersion";

export const dynamic = "force-dynamic";

export function GET() {
  const source = `
const VERSION = ${JSON.stringify(POS_FRONTEND_VERSION)};
const STATIC_CACHE = "parkfacil-pos-static-" + VERSION;

self.addEventListener("install", () => {
  // La actualización espera hasta que el POS confirme que no hay una operación activa.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("parkfacil-pos-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate" && (url.pathname === "/pos" || url.pathname.startsWith("/pos/"))) {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" })).catch(() => new Response(
        "<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ParkFacil POS sin conexión</title><body style='font-family:system-ui;background:#ECEFF1;color:#263238;padding:2rem'><main style='max-width:32rem;margin:auto;background:white;border-radius:1.5rem;padding:2rem'><h1>Sin conexión</h1><p>ParkFacil POS necesita conexión para operar. No se registró ninguna transacción.</p><button onclick=location.reload() style='padding:.8rem 1rem'>Reintentar</button></main></body></html>",
        { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
      ))
    );
    return;
  }

  // Mismo patrón exacto que /pos arriba (2026-09-02, "PWA instalable" de
  // Inspector): fallback puramente informativo, red primero, sin cachear
  // ninguna patente/fiscalización/dato de sesión -- si la red falla, solo
  // se sirve este HTML estático.
  if (request.mode === "navigate" && (url.pathname === "/inspector" || url.pathname.startsWith("/inspector/"))) {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" })).catch(() => new Response(
        "<!doctype html><html lang=es><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ParkFacil Inspector sin conexión</title><body style='font-family:system-ui;background:#EEF4FF;color:#041E42;padding:2rem'><main style='max-width:32rem;margin:auto;background:white;border-radius:1.5rem;padding:2rem'><h1>Sin conexión</h1><p>ParkFacil Inspector necesita conexión para consultar y fiscalizar. No se registró ninguna fiscalización.</p><button onclick=location.reload() style='padding:.8rem 1rem'>Reintentar</button></main></body></html>",
        { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
      ))
    );
    return;
  }

  const isVersionedAsset = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  if (!isVersionedAsset) return;
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
  );
});
`;

  return new Response(source, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
