"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

export default function ZoneDeleteButton({ parkingCode, levelId, zone }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(`Se eliminará la zona ${zone.name} (${zone.code}). Esta acción no se puede deshacer. ¿Continuar?`)) return;
    setDeleting(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${parkingCode}/niveles/${levelId}/zonas/${zone.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No fue posible eliminar la zona.");
      router.refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeleting(false);
    }
  }

  return <>
    <button type="button" disabled={deleting} onClick={remove} className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60">{deleting ? "Eliminando…" : "Eliminar"}</button>
    {error && <p role="alert" className="w-full rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </>;
}
