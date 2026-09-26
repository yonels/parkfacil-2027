"use client";

import { useEffect } from "react";
import { startLegacyCssSupport } from "@/lib/pos/legacyCssLoader";

// Compatibilidad CSS para WebView 83 (TUU PRO2). Arranca al evaluar el módulo
// (antes de hidratar, para acortar el tiempo sin estilos) y de nuevo en el
// efecto por si el módulo se evaluó sin window. Idempotente; no hace nada en
// navegadores con soporte de cascade layers.
if (typeof window !== "undefined") startLegacyCssSupport(window);

export default function LegacyWebViewCss() {
  useEffect(() => {
    startLegacyCssSupport(window);
  }, []);
  return null;
}
