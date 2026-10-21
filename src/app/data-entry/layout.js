import LegacyWebViewCss from "@/components/pos/LegacyWebViewCss";

// /data-entry y /data-entry/pos también se abren desde la PRO2 (WebView 83):
// misma compatibilidad CSS que /pos. No agrega nada más al segmento.
export default function DataEntryLayout({ children }) {
  return (
    <>
      <LegacyWebViewCss />
      {children}
    </>
  );
}
