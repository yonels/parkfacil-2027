"use client";

import { Children, isValidElement } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getParentHref } from "@/lib/navigationParent.mjs";

function containsBackAction(actions) {
  return Children.toArray(actions).some((action) => {
    if (!isValidElement(action)) return false;
    return ["back", "volver"].includes(String(action.key || "").replace(/^\.\$/, ""));
  });
}

// tone="onstreet" es opt-in -- únicamente lo pasan las pantallas On Street
// (ver OnStreetAdminPage.js). Todo el resto de la plataforma (incluido Off
// Street) sigue usando el azul corporativo por defecto sin cambios (ver
// §12/§13 de la auditoría de acceso por producto: el cobrizo identifica el
// producto On Street, no reemplaza la marca general).
const TONES = {
  brand: { border: "border-[#5271E8]", bg: "bg-[#3150D8]", accent: "text-[#3150D8]", hoverAccent: "hover:text-[#3150D8]", hoverBorder: "hover:border-[#3150D8]" },
  onstreet: { border: "border-[var(--pf-color-onstreet-border)]", bg: "bg-[var(--pf-color-onstreet-primary)]", accent: "text-[var(--pf-color-onstreet-primary)]", hoverAccent: "hover:text-[var(--pf-color-onstreet-primary)]", hoverBorder: "hover:border-[var(--pf-color-onstreet-primary)]" },
};

export default function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Volver",
  // "onBack" (2026-08-30, "todas las páginas de On Street deben tener un
  // botón Volver que lleve a la sesión inmediatamente precedente"):
  // función opcional -- cuando se pasa, reemplaza el <Link href=...> de
  // siempre por un <button onClick={onBack}> (típicamente
  // () => router.back(), navegación real de historial, no un destino
  // fijo). 100% retrocompatible: ningún llamador existente pasa "onBack",
  // así que todos siguen usando exactamente el mismo <Link href=...> de
  // antes -- este cambio no modifica el comportamiento de PageHeader en
  // ningún otro módulo de la plataforma.
  onBack,
  // "backToHistory" (2026-08-30): igual que "onBack", pero como boolean --
  // para callers que son Server Component (p. ej. un page.js con "export
  // const metadata", que no puede ser "use client" y por lo tanto no
  // puede construir la función () => router.back() él mismo). PageHeader
  // ya es "use client", así que resuelve router.back() aquí adentro.
  backToHistory = false,
  showBack = true,
  eyebrow = "GESTIÓN PARKFACIL",
  tone = "brand",
}) {
  const pathname = usePathname();
  const router = useRouter();
  const effectiveOnBack = onBack || (backToHistory ? () => router.back() : undefined);
  const parentHref = backHref === undefined ? getParentHref(pathname) : backHref;
  const renderBack = showBack && (effectiveOnBack || parentHref) && !containsBackAction(actions);
  const palette = TONES[tone] || TONES.brand;

  return (
    <div className={`flex flex-col gap-4 rounded-3xl border ${palette.border} ${palette.bg} p-5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between lg:p-6`}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-100">{eyebrow}</p> : null}
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm text-white/85">{description}</p> : null}
      </div>
      {renderBack || actions ? (
        <div className={`flex shrink-0 flex-wrap gap-3 [&>a]:border-white/70 [&>a]:bg-white [&>a]:${palette.accent} [&>button]:border-white/70 [&>button]:bg-white [&>button]:${palette.accent}`}>
          {renderBack ? (
            effectiveOnBack ? (
              <button
                type="button"
                onClick={effectiveOnBack}
                data-back-action
                className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition ${palette.hoverBorder} ${palette.hoverAccent}`}
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </button>
            ) : (
              <Link
                href={parentHref}
                data-back-action
                className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition ${palette.hoverBorder} ${palette.hoverAccent}`}
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </Link>
            )
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
