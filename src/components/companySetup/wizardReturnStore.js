"use client";
// Marca de «Volver» al asistente (SOL-2026-10-29-014) en sessionStorage: vive
// solo en esta pestaña. Ver src/lib/companySetup/wizardReturn.mjs.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildWizardReturnMarker, resolveWizardReturnHref, WIZARD_RETURN_KEY } from "@/lib/companySetup/wizardReturn.mjs";

export function rememberWizardReturn(stepHref) {
  try {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.sessionStorage.setItem(WIZARD_RETURN_KEY, JSON.stringify(buildWizardReturnMarker(stepHref, returnTo)));
  } catch { /* sin almacenamiento: «Volver» conserva su destino de siempre */ }
}

export function forgetWizardReturn() {
  try { window.sessionStorage.removeItem(WIZARD_RETURN_KEY); } catch { /* sin almacenamiento */ }
}

// Destino de «Volver» al asistente para la pantalla actual, o null.
export function useWizardReturnHref(pathname) {
  const [href, setHref] = useState(null);
  useEffect(() => {
    let marker = null;
    try { marker = JSON.parse(window.sessionStorage.getItem(WIZARD_RETURN_KEY) || "null"); } catch { marker = null; }
    const next = resolveWizardReturnHref(marker, pathname);
    const timer = window.setTimeout(() => setHref(next), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return href;
}

// Los enlaces «Volver» propios de cada pantalla (escritos en cada página)
// también regresan al asistente mientras la marca esté vigente. Solo enlaces
// <a> cuyo texto empieza con «Volver» («Volver», «Volver al configurador»);
// botones y diálogos no se tocan.
export function useWizardReturnLinks(returnHref) {
  const router = useRouter();
  useEffect(() => {
    if (!returnHref) return undefined;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || !/^Volver(\s|$)/.test(link.textContent.trim())) return;
      event.preventDefault();
      event.stopPropagation();
      router.push(returnHref);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [returnHref, router]);
}
