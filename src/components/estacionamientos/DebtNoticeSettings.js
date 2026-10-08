"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

// Interruptor del aviso de deuda pendiente (SOL-2026-10-08-003, D6/D7): al
// ingresar una patente con deudas en cualquier estacionamiento de la empresa,
// el POS muestra el aviso. No bloquea el ingreso.
export default function DebtNoticeSettings({ parkingId }) {
  const endpoint = `/api/estacionamientos/${parkingId}/configuracion/aviso-deuda`;
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    authenticatedFetch(endpoint).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el aviso.");
      if (active) setEnabled(body.data.enabled === true);
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  async function save(next) {
    setSaving(true); setError(""); setFeedback("");
    try {
      const response = await authenticatedFetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No fue posible guardar.");
      setEnabled(body.data.enabled === true);
      setFeedback(body.data.enabled ? "Aviso activado." : "Aviso desactivado.");
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <Link href={`/estacionamientos/${parkingId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver al estacionamiento</Link>
    <section className="rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold text-[#041E42]">Aviso de deuda pendiente</h2>
      <p className="mt-2 text-sm text-slate-600">Cuando un vehículo se retira sin pagar, el operador lo marca en el POS. El monto se calcula hasta el cierre de su turno y queda como deuda.</p>
      <p className="mt-2 text-sm text-slate-600">Con el aviso activo, al ingresar esa patente en este estacionamiento el POS muestra sus deudas pendientes de cualquier estacionamiento de la empresa. El ingreso no se bloquea.</p>
      {loading ? <p className="mt-5 text-sm text-slate-500">Cargando...</p> : <div className="mt-5 flex flex-wrap items-center gap-4">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`} data-testid="debt-notice-state">{enabled ? "Activo" : "Inactivo"}</span>
        <button type="button" disabled={saving} onClick={() => save(!enabled)} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" data-testid="debt-notice-toggle">
          {saving ? "Guardando..." : enabled ? "Desactivar aviso" : "Activar aviso"}
        </button>
      </div>}
      {feedback ? <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-5 text-sm"><Link href="/deudas" className="font-semibold text-[#3150D8]">Ver deudas pendientes</Link></p>
    </section>
  </div>;
}
