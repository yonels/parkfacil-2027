import Link from "next/link";
import { BookOpen } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { getDocumentos } from "@/lib/documentos";

const categories = ["General", "Módulos", "Cambios"];

export default function DocumentosPage() {
  const documents = getDocumentos();

  return (
    <AppShell title="Documentación" description="Información funcional y técnica">
      <div className="space-y-6">
        <PageHeader title="Documentación" description="Información funcional y técnica del proyecto ParkFacil 2027." />
        {categories.map((category) => {
          const items = documents.filter((document) => document.category === category);
          if (!items.length) return null;
          return (
            <section key={category} aria-labelledby={`category-${category}`} className="space-y-3">
              <h2 id={`category-${category}`} className="text-lg font-semibold text-[#041E42]">{category}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((document) => (
                  <article key={document.slug} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
                    <BookOpen className="h-5 w-5 text-[#3150D8]" aria-hidden="true" />
                    <h3 className="mt-3 font-semibold text-[#041E42]">{document.title}</h3>
                    <p className="mt-1 flex-1 text-sm leading-5 text-slate-600">{document.description}</p>
                    <Link href={`/documentos/${document.slug}`} className="mt-4 w-fit text-sm font-semibold text-[#3150D8] hover:text-[#1E5EFF]">Ver documento</Link>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
