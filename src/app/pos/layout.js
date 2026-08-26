import ServiceWorkerRegistration from "@/components/pwa/ServiceWorkerRegistration";

export const metadata = {
  title: "ParkFacil POS",
  description: "Terminal operacional ParkFacil para ingresos, salidas y cobros.",
  applicationName: "ParkFacil POS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ParkFacil",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: "/icons/parkfacil-pos.svg",
    apple: "/icons/parkfacil-pos.svg",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#455A64",
};

export default function PosLayout({ children }) {
  return (
    <>
      <ServiceWorkerRegistration />
      {children}
    </>
  );
}
