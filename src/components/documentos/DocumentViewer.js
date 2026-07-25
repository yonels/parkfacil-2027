import Link from "next/link";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-300 underline underline-offset-4">$1</a>');
}

function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      const codeContent = codeLines.join("\n");
      html.push(`<pre class="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 p-4"><code class="language-${language} text-sm text-cyan-200">${escapeHtml(codeContent)}</code></pre>`);
      index += 1;
      continue;
    }

    if (/^\|/.test(trimmed) && index + 1 < lines.length && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1].trim())) {
      const rows = [];
      let currentIndex = index;

      while (currentIndex < lines.length && lines[currentIndex].trim().startsWith("|")) {
        rows.push(lines[currentIndex].trim());
        currentIndex += 1;
      }

      const tableRows = rows.map((row) => row.split("|").slice(1, -1).map((cell) => cell.trim()));
      const headers = tableRows[0];
      const bodyRows = tableRows.slice(2);
      const bodyMarkup = bodyRows
        .map((row) => `<tr>${row.map((cell) => `<td class="border border-slate-700 px-4 py-2 text-sm text-slate-300">${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("");

      html.push(`<table class="mt-6 w-full overflow-hidden rounded-2xl border border-slate-800"><thead><tr>${headers.map((cell) => `<th class="border border-slate-700 bg-slate-900 px-4 py-2 text-left text-sm font-semibold text-white">${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>${bodyMarkup}</tbody></table>`);
      index = currentIndex;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      const content = trimmed.replace(/^#{1,3}\s+/, "");
      const className = level === 1
        ? "text-4xl font-bold mt-8 mb-4 text-white"
        : level === 2
          ? "text-2xl font-semibold mt-8 mb-3 text-cyan-200"
          : "text-xl font-semibold mt-6 mb-2 text-slate-100";
      html.push(`<h${level} class="${className}">${renderInline(content)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(`<li class="ml-5 list-disc text-slate-300">${renderInline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ul class="mt-4 space-y-2">${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(`<li class="ml-5 list-decimal text-slate-300">${renderInline(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ol class="mt-4 space-y-2">${items.join("")}</ol>`);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !/^#{1,3}\s+/.test(lines[index].trim()) && !/^[-*]\s+/.test(lines[index].trim()) && !/^\d+\.\s+/.test(lines[index].trim()) && !/^\|/.test(lines[index].trim()) && !lines[index].trim().startsWith("```")) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    if (paragraphLines.length > 0) {
      html.push(`<p class="mb-4 text-slate-300 leading-7">${renderInline(paragraphLines.join(" "))}</p>`);
      continue;
    }

    index += 1;
  }

  return html.join("");
}

function extractCode(markdown) {
  const match = markdown.match(/^(?:CÓDIGO|CODIGO)[^\n]*[:\-]\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

export default function DocumentViewer({ document }) {
  const code = extractCode(document.contenido);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/20">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-cyan-300">Visor documental</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">{document.title}</h1>
            <p className="mt-3 max-w-3xl text-slate-400">{document.description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/documentos" className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300">
              ← Volver a la Biblioteca
            </Link>
            {code ? (
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300">
                {code}
              </span>
            ) : null}
          </div>
        </div>

        <article className="rounded-3xl border border-slate-800 bg-slate-900/70 p-8 shadow-xl shadow-slate-950/20">
          <div dangerouslySetInnerHTML={{ __html: parseMarkdown(document.contenido) }} />
        </article>
      </div>
    </main>
  );
}
