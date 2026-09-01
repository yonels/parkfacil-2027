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
      name: "ParkFacil Inspectores",
      short_name: "Inspectores",
      description: "Consulta de patentes y fiscalización en terreno para ParkFacil.",
      start_url: "/inspector",
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
