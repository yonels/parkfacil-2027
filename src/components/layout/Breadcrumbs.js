"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

function formatSegment(segment) {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/Documentos/g, "Documentación");
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (!segments.length) {
    return null;
  }

  const items = [];
  let href = "";

  items.push({ label: "Inicio", href: "/" });

  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const isLast = index === segments.length - 1;
    items.push({ label: formatSegment(segment), href, isLast });
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
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
