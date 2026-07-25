import Link from "next/link";
import { AlertTriangle, BookOpen, Home } from "lucide-react";
import AppShell from "@/components/layout/AppShell";

export default function NotFound() {
  return (
    <AppShell title="Página no encontrada" description="Ruta inexistente en ParkFacil 2027">
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-[#041E42]">No encontramos esta página</h1>
          <p className="mt-3 text-slate-600">La ruta solicitada no existe en la plataforma base de ParkFacil 2027.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <Home className="h-4 w-4" />
              Volver al inicio
            </Link>
            <Link href="/documentos" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <BookOpen className="h-4 w-4" />
              Abrir documentación
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
