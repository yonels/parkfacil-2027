import { NextResponse } from "next/server";

// Manifest propio del módulo Inspectores, servido en /inspector/manifest.webmanifest
// -- separado del manifest global de ParkFacil POS (src/app/manifest.js,
// servido en /manifest.webmanifest). Next.js no permite anidar el archivo de
// convención manifest.js dentro de un segmento de ruta (solo existe a nivel
// raíz de app/); un Route Handler explícito es la forma correcta de servir
// un segundo manifest sin duplicar el existente ni pisar su identidad PWA.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    {
      id: "/inspector",
      // "ParkFacil Inspector" / "Inspector" (2026-09-02, PWA instalable):
      // antes decía "Inspectores" (plural) aquí -- inconsistente con
      // /inspector/login, que YA usa "ParkFacil Inspector" (singular) en su
      // <title> y en el H1 visible (ver src/app/inspector/login/page.js).
      // Se alinea el manifest a esa identidad ya existente; no se toca
      // ningún otro texto en pantalla (p. ej. InspectorTopBar.js sigue
      // diciendo "Inspectores" -- fuera de alcance de esta tarea).
      name: "ParkFacil Inspector",
      short_name: "Inspector",
      description: "Consulta de patentes y fiscalización en terreno para ParkFacil.",
      // start_url = "/inspector/login" (2026-09-02, "PWA start URL
      // corregido"): antes era "/inspector". El launch en sí SIEMPRE
      // terminaba bien encaminado (proxy.js ya redirige /inspector sin
      // sesión a /inspector/login, nunca a /login -- ver PUBLIC_PATHS/
      // isInspectorPath ahí) -- el bug real reportado en Android fue que la
      // PWA se instaló mientras el navegador estaba en /login (Root), no en
      // /inspector: ese dominio raíz/túnel, sin ruta, redirige sin sesión a
      // /login genérico (ni /pos ni /inspector calzan en proxy.js), y ese
      // /login no declara manifest propio -- hereda el manifest GLOBAL
      // (src/app/manifest.js, identidad POS) vía la convención de Next.js.
      // Fijar aquí el start_url exacto a /inspector/login hace que
      // cualquier instalación futura hecha DESDE una pantalla de Inspector
      // (login o app) quede inequívocamente anclada a esa ruta, sin
      // depender de desde qué URL exacta se disparó "Agregar a inicio".
      // scope se mantiene "/inspector" (sin barra final): como prefijo de
      // string cubre tanto "/inspector" como "/inspector/login" y
      // "/inspector/*" sin ambigüedad -- "/inspector/" con barra final
      // podría no calzar con la ruta real "/inspector" (sin barra) en un
      // matching estricto, así que no se cambia pese a la preferencia
      // indicada (ver informe).
      start_url: "/inspector/login",
      scope: "/inspector",
      display: "standalone",
      orientation: "any",
      background_color: "#EEF4FF",
      theme_color: "#041E42",
      lang: "es-CL",
      categories: ["business", "productivity"],
      // SVG "any" primero (mejor calidad), más PNG 192/512 -- requeridos por
      // varios instaladores PWA de iOS/Android que no aceptan solo SVG.
      icons: [
        { src: "/icons/parkfacil-inspectores.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icons/parkfacil-inspectores-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/parkfacil-inspectores-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/parkfacil-inspectores-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        { src: "/icons/parkfacil-inspectores-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "/icons/parkfacil-inspectores-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
