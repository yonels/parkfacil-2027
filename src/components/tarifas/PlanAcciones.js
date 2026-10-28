"use client";

// Acciones de Root sobre un plan comercial real (2026-10-28): editar y
// archivar/reactivar. No hay borrado: archivar conserva el plan y su historial.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, LoaderCircle, RotateCcw } from "lucide-react";
import PlanCreateModal from "@/components/tarifas/PlanCreateModal";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

export default function PlanAcciones({ plan }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const archivado = plan.estado === "archived";

  async function cambiarEstado() {
    const pregunta = archivado
      ? `¿Reactivar el plan ${plan.codigo}? Quedará en estado Activo.`
      : `¿Archivar el plan ${plan.codigo}? Dejará de ofrecerse, pero se conserva junto con su historial.`;
    if (!window.confirm(pregunta)) return;
    setEnviando(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/planes/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: archivado ? "reactivar" : "archivar", expectedUpdatedAt: plan.updatedAt }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible actualizar el plan.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible actualizar el plan.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PlanCreateModal plan={plan} onSaved={() => router.refresh()} />
      <button
        type="button"
        onClick={cambiarEstado}
        disabled={enviando}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${archivado ? "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50" : "border-amber-200 bg-white text-amber-800 hover:bg-amber-50"}`}
      >
        {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : archivado ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        {archivado ? "Reactivar" : "Archivar"}
      </button>
      {error ? <p role="alert" className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
