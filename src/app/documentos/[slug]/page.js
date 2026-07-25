import Link from "next/link";
import { getDocumento } from "@/lib/documentos";
import DocumentViewer from "@/components/documentos/DocumentViewer";

export default async function DocumentoPage({ params }) {
  const resolvedParams = await params;
  const documento = await getDocumento(resolvedParams.slug);

  if (!documento) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
        <div className="mx-auto flex max-w-3xl flex-col items-start gap-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-10 shadow-xl shadow-slate-950/20">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Documento no encontrado</p>
          <h1 className="text-4xl font-semibold text-white">No existe este documento</h1>
          <p className="text-slate-400">El recurso solicitado no está disponible en la biblioteca documental.</p>
          <Link href="/documentos" className="rounded-full bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">
            ← Volver a la Biblioteca
          </Link>
        </div>
      </main>
    );
  }

  return <DocumentViewer document={documento} />;
}
