import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-12">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-10 shadow-xl shadow-slate-950/10">
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Fundación del Proyecto</p>
          <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">ParkFacil 2027</h1>
          <p className="mt-4 max-w-3xl text-slate-300 sm:text-lg">
            Este proyecto establece la base inicial de la plataforma ParkFacil 2027 con la estructura, documentación y validaciones de la etapa 00.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
            <h2 className="text-2xl font-semibold text-white">Documentación</h2>
            <p className="mt-3 text-slate-400">La biblioteca documental incluye los documentos oficiales de la etapa 00, requisitos y decisiones de arquitectura.</p>
            <ul className="mt-6 space-y-3 text-slate-300">
              <li>README.md</li>
              <li>CHANGELOG.md</li>
              <li>docs/MasterProjectDocument.md</li>
              <li>docs/Requirements.md</li>
              <li>docs/ArchitectureDecisionLog.md</li>
            </ul>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
            <h2 className="text-2xl font-semibold text-white">Biblioteca Documental</h2>
            <p className="mt-3 text-slate-400">Página local de acceso a los documentos de la etapa 00, sin dependencia de Supabase.</p>
            <Link
              href="/documentos"
              className="mt-6 inline-flex rounded-full bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Abrir Biblioteca Documental
            </Link>
          </article>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8">
          <h2 className="text-2xl font-semibold text-white">Preparación Supabase</h2>
          <p className="mt-3 text-slate-400">Se creó un archivo de ejemplo `.env.example` y un README de Supabase sin crear tablas ni proyectos remotos.</p>
        </section>
      </div>
    </main>
  );
}
