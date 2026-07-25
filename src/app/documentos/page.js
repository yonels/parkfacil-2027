import Link from "next/link";
import { getDocumentos } from "@/lib/documentos";

export default function DocumentosPage() {
  const documentos = getDocumentos();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Biblioteca Documental</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Documentos de Fundación
          </h1>
          <p className="mt-4 text-slate-300 sm:text-lg">
            Accede a los documentos oficiales creados para la etapa 00 de ParkFacil 2027.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          {documentos.map((doc) => (
            <Link
              key={doc.slug}
              href={`/documentos/${doc.slug}`}
              className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 transition hover:border-cyan-400 hover:bg-slate-900"
            >
              <h2 className="text-xl font-semibold text-white">{doc.title}</h2>
              <p className="mt-3 text-slate-400">{doc.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
