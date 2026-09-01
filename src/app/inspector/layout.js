import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";

// Mismo patrón que src/app/pos/layout.js: metadata/viewport propios del
// segmento (Next.js los combina con los del layout raíz), y se reutiliza el
// MISMO componente de registro de service worker que ya usa POS -- no se
// crea un service worker nuevo para Inspectores.
export const metadata = {
  title: "ParkFacil Inspectores",
  description: "Consulta de patentes y fiscalización en terreno para ParkFacil.",
  applicationName: "ParkFacil Inspectores",
  manifest: "/inspector/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Inspectores",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icons/parkfacil-inspectores.svg",
    // Safari/iOS históricamente no soporta SVG como apple-touch-icon --
    // se usa el PNG 192x192 para máxima compatibilidad "Agregar a inicio".
    apple: "/icons/parkfacil-inspectores-192.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#041E42",
};

export default function InspectorLayout({ children }) {
  return (
    <>
      <ServiceWorkerRegistration />
      {children}
    </>
  );
}
