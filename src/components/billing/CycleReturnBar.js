"use client";

import { useEffect, useState } from "react";
import { forgetCycleReturn } from "./cycleReturnStore";

// Barra «Volver al ciclo» (SOL-2026-11-05-005). SOL-2026-11-10-001 (H20): muestra la etapa actual de la empresa
// consultada al ciclo, no la que tenía al salir de él (seguía diciendo «Etapa 6: Emisión» con el ciclo terminado).
export default function CycleReturnBar({ value, onBack, onDismiss }) {
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    let active = true;
    if (!value?.period || !value?.companyId) return undefined;
    fetch(`/api/billing/cycle?period=${encodeURIComponent(value.period)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const row = payload?.data?.rows?.find((item) => item.company?.id === value.companyId);
        if (!active || !row) return;
        const step = row.steps?.find((item) => item.n === row.stage);
        setCurrent(row.finished ? { finished: true } : { n: row.stage, short: step?.short || "" });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [value?.period, value?.companyId]);

  const text = current?.finished
    ? "Ciclo del mes terminado."
    : `Etapa ${current?.n ?? value.stepN}: ${current?.short ?? value.stepShort}. Cuando termine aquí, vuelva para continuar con la etapa siguiente.`;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
      <button type="button" onClick={onBack} className="rounded-full bg-[#3150D8] px-4 py-1.5 font-bold text-white shadow-sm">← Volver al ciclo</button>
      <span><b>{value.companyName}</b> · {text}</span>
      <button type="button" onClick={() => { forgetCycleReturn(); onDismiss(); }} className="ml-auto text-indigo-500 hover:text-indigo-800" aria-label="Cerrar">✕</button>
    </div>
  );
}
