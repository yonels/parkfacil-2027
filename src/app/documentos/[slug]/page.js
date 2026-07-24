import { getDocumento } from "@/lib/documentos";

function renderMarkdown(markdown) {
  return markdown
    .split("\n")
    .map((line, index) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("# ")) {
        return `<h1 class=\"text-4xl font-bold mt-8 mb-4 text-white\">${trimmed.slice(2)}</h1>`;
      }

      if (trimmed.startsWith("## ")) {
        return `<h2 class=\"text-2xl font-semibold mt-8 mb-3 text-cyan-200\">${trimmed.slice(3)}</h2>`;
      }

      if (trimmed.startsWith("### ")) {
        return `<h3 class=\"text-xl font-semibold mt-6 mb-2 text-slate-100\">${trimmed.slice(4)}</h3>`;
      }

      if (trimmed.startsWith("- ")) {
        return `<li class=\"ml-5 list-disc text-slate-300\">${trimmed.slice(2)}</li>`;
      }

      if (trimmed === "") {
        return "<br />";
      }

      return `<p class=\"text-slate-300 leading-7 mb-4\">${trimmed}</p>`;
    })
    .join("");
}

export default async function DocumentoPage({ params }) {
  const documento = await getDocumento(params.slug);

  if (!documento) {
    return <div className="min-h-screen bg-slate-950 text-white p-10">Documento no encontrado.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold text-white">{documento.title}</h1>
        <p className="mt-2 text-slate-400">{documento.description}</p>
        <article
          className="prose prose-invert mt-10 max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(documento.contenido) }}
        />
      </div>
    </main>
  );
}
