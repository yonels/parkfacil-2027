"use client";

// Moneda del plan en «Cargos principales» (SOL-2026-10-28-002): Root elige
// $ Pesos o UF. Guarda con el mismo PATCH de «Editar plan» (con control de
// concurrencia); los montos no se convierten, solo cambia la moneda.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { MONEDAS_PLAN, etiquetaMoneda, formularioDesdePlan } from "@/lib/commercialPlanInput.mjs";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

export default function PlanMonedaSelector({ plan }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function cambiar(moneda) {
    if (moneda === plan.moneda) return;
    if (!window.confirm(`¿Cambiar la moneda del plan ${plan.codigo} de ${etiquetaMoneda(plan.moneda)} a ${etiquetaMoneda(moneda)}? Los montos se mantienen (no se convierten) y se registra una versión nueva del plan.`)) return;
    setEnviando(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/planes/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formularioDesdePlan(plan), currency: moneda, accion: "editar", expectedUpdatedAt: plan.updatedAt }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cambiar la moneda.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cambiar la moneda.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-slate-500">Moneda del plan</p>
      <div role="radiogroup" aria-label="Moneda del plan" className="mt-2 inline-flex rounded-full border border-slate-200 bg-white p-1">
        {MONEDAS_PLAN.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={plan.moneda === m.value} disabled={enviando} onClick={() => cambiar(m.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${plan.moneda === m.value ? "bg-[#3150D8] text-white" : "text-slate-600 hover:text-[#3150D8]"}`}>
            {m.label}
          </button>
        ))}
        {enviando ? <LoaderCircle className="ml-2 h-4 w-4 self-center animate-spin text-[#3150D8]" /> : null}
      </div>
      {error ? <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
