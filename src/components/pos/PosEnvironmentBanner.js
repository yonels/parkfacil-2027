"use client";

import { useSyncExternalStore } from "react";

import { posTestEnvironmentLabel } from "@/lib/pos/posEnvironment.mjs";

// Franja «AMBIENTE DE PRUEBAS (QA) — sin dinero real» fuera de producción (SOL-2026-11-12-005).
// El host solo se conoce en el navegador: en el servidor no se pinta nada (null) y el cliente
// la muestra al hidratar si el host no es de producción. className permite ubicarla en grillas
// (p. ej. lg:col-span-2 en el login).
const subscribe = () => () => {};
const clientLabel = () => posTestEnvironmentLabel(window.location.hostname);
const serverLabel = () => null;

export default function PosEnvironmentBanner({ className = "" }) {
  const label = useSyncExternalStore(subscribe, clientLabel, serverLabel);
  if (!label) return null;
  return (
    <div
      role="status"
      data-pos-environment="test"
      className={`w-full border-y-2 border-amber-500 bg-amber-300 px-3 py-2 text-center text-sm font-black tracking-wide text-amber-950 ${className}`}
    >
      {label}
    </div>
  );
}
