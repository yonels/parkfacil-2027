"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";
import { getParentHref } from "@/lib/navigationParent.mjs";

function formatSegment(segment) {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/Documentos/g, "Documentación");
}

export default function Breadcrumbs({ onBack }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const parentHref = getParentHref(pathname);

  const items = [];
  let href = "";

  items.push({ label: segments.length ? "Inicio" : "Operaciones", href: "/", isLast: !segments.length });

  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const isLast = index === segments.length - 1;
    items.push({ label: formatSegment(segment), href, isLast });
  });

  return (
    <nav aria-label="Ubicación actual" className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-600">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-[#3150D8] shadow-sm transition hover:bg-[#EEF4FF]" aria-label="Volver a la página principal de Facturación"><ArrowLeft className="h-4 w-4" /><span>Volver</span></button>
      ) : parentHref ? <Link href={parentHref} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 font-semibold text-[#3150D8] shadow-sm transition hover:bg-[#EEF4FF]" aria-label="Volver a la página padre"><ArrowLeft className="h-4 w-4" /><span>Volver</span></Link> : null}
      <span className="hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 xl:inline">Estás en</span>
      {items.map((item, index) => (
        <div key={item.href} className="flex items-center gap-2">
          {index === 0 ? <Home className="h-4 w-4" /> : null}
          {item.isLast ? (
            <span className="font-medium text-[#041E42]">{item.label}</span>
          ) : (
            <Link href={item.href} className="transition hover:text-[#3150D8]">
              {item.label}
            </Link>
          )}
          {index < items.length - 1 ? <ChevronRight className="h-4 w-4" /> : null}
        </div>
      ))}
    </nav>
  );
}
