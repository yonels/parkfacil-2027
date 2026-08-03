"use client";

import { Children, isValidElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getParentHref } from "@/lib/navigationParent.mjs";

function containsBackAction(actions) {
  return Children.toArray(actions).some((action) => {
    if (!isValidElement(action)) return false;
    return ["back", "volver"].includes(String(action.key || "").replace(/^\.\$/, ""));
  });
}

export default function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Volver",
  showBack = true,
  eyebrow = "GESTIÓN PARKFACIL",
}) {
  const pathname = usePathname();
  const parentHref = backHref === undefined ? getParentHref(pathname) : backHref;
  const renderBack = showBack && parentHref && !containsBackAction(actions);

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between lg:p-6">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-100">{eyebrow}</p> : null}
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm text-blue-100">{description}</p> : null}
      </div>
      {renderBack || actions ? (
        <div className="flex shrink-0 flex-wrap gap-3 [&>a]:border-white/70 [&>a]:bg-white [&>a]:text-[#3150D8] [&>button]:border-white/70 [&>button]:bg-white [&>button]:text-[#3150D8]">
          {renderBack ? (
            <Link
              href={parentHref}
              data-back-action
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:border-[#3150D8] hover:text-[#3150D8]"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
