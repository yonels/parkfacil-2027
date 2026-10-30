import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

// «Data Entry» del portal Root en modo demostración (SOL-2026-10-30-003): el
// POS para mostrar a clientes, sin servidor, sin impresora y sin cobro. La
// demo es un archivo estático (public/demo-pos/index.html) cuyos datos viven
// solo en el navegador. Ruta bajo /administracion: exclusiva de Root.
export const metadata = { title: "Data Entry · Demostración | ParkFacil" };

export default function DataEntryDemoPage() {
  return (
    <div className="flex h-dvh flex-col bg-[#EEF2F7]">
      <header className="flex flex-wrap items-center gap-3 bg-[#041E42] px-4 py-2 text-white">
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver al portal Root</Link>
        <p className="text-sm font-bold">Data Entry · Demostración para clientes</p>
        <a href="/demo-pos/index.html" target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">Pantalla completa<ExternalLink className="h-4 w-4" /></a>
      </header>
      <iframe src="/demo-pos/index.html" title="Data Entry en modo demostración" className="w-full flex-1 border-0" />
    </div>
  );
}
