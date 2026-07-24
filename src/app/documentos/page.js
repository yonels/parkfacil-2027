import Link from "next/link";

const documentos = [
  {
    title: "Master Project Document",
    href: "/documentos/master-project-document",
    description: "Resumen del proyecto y estado de la fundación.",
  },
  {
    title: "Requirements",
    href: "/documentos/requirements",
    description: "Requisitos y restricciones de la etapa 00.",
  },
  {
    title: "Architecture Decision Log",
    href: "/documentos/architecture-decision-log",
    description: "Decisiones de arquitectura iniciales.",
  },
  {
    title: "Changelog",
    href: "/documentos/changelog",
    description: "Historial de versiones del proyecto.",
  },
  {
    title: "Stage 00 - Foundation",
    href: "/documentos/stage00-foundation",
    description: "Informe de entrega de la etapa de fundación.",
  },
  {
    title: "Documentos Codex",
    href: "/documentos/codex-template",
    description: "Plantilla base para documentos Codex.",
  },
];

export default function DocumentosPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">
            Biblioteca Documental
          </p>
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
              key={doc.href}
              href={doc.href}
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
