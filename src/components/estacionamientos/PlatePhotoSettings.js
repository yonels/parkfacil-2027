"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const MODE_OPTIONS = [
  { value: "DISABLED", label: "Desactivada", detail: "No se muestra ningún control de cámara. El flujo de ingreso queda exactamente igual al actual." },
  { value: "OPTIONAL", label: "Opcional", detail: "El operador puede tomar la fotografía o continuar sin ella." },
  { value: "REQUIRED", label: "Obligatoria", detail: "No se puede confirmar el ingreso sin una fotografía válida de la patente." },
];

export default function PlatePhotoSettings({ parkingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [plateMode, setPlateMode] = useState("DISABLED");
  const [printOnTicket, setPrintOnTicket] = useState(false);

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/estacionamientos/${parkingId}/configuracion/foto-patente`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (!active) return;
        setData(body.data);
        setPlateMode(body.data.plateMode);
        setPrintOnTicket(Boolean(body.data.printOnTicket));
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [parkingId]);

  async function save() {
    setSaving(true); setError(""); setFeedback("");
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${parkingId}/configuracion/foto-patente`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plateMode, printOnTicket, evidenceRetentionDays: data?.evidenceRetentionDays ?? null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body.data);
      setFeedback("Configuración guardada.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <State text="Cargando configuración…" />;
  if (error && !data) return <State text={error} error />;

  const dirty = data && (plateMode !== data.plateMode || printOnTicket !== Boolean(data.printOnTicket));

  return (
    <div className="space-y-5">
      <Link href={`/estacionamientos/${parkingId}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[#3150D8] hover:text-[#3150D8]">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-sm font-semibold text-[#3150D8]">Off Street</p>
        <h1 className="mt-1 text-2xl font-bold text-[#041E42]">Operación de entrada</h1>
        <p className="mt-1 text-slate-600">Fotografía de la patente al registrar un ingreso (ENTRY) en el POS.</p>

        {error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        {feedback ? <p role="status" className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{feedback}</p> : null}

        <fieldset className="mt-5 space-y-3">
          <legend className="text-sm font-bold text-slate-700">Fotografía de patente</legend>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${plateMode === option.value ? "border-[#3150D8] bg-[#F5F9FF]" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <input
                type="radio"
                name="plateMode"
                value={option.value}
                checked={plateMode === option.value}
                onChange={() => setPlateMode(option.value)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-[#041E42]">{option.label}</span>
                <span className="block text-sm text-slate-600">{option.detail}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 ${plateMode === "DISABLED" ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white"}`}>
          <input
            type="checkbox"
            checked={printOnTicket}
            disabled={plateMode === "DISABLED"}
            onChange={(event) => setPrintOnTicket(event.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-semibold">Imprimir fotografía en ticket</span>
            <span className="block text-sm">
              Solo tiene efecto cuando el ingreso quedó con fotografía. Si el dispositivo de impresión no admite
              imágenes, el ticket de texto se imprime igual — nunca se bloquea el ingreso por esto.
            </span>
          </span>
        </label>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-full bg-[#3150D8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2441c7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </section>
    </div>
  );
}

function State({ text, error }) {
  return <div className={`rounded-3xl border p-8 text-center ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600"}`}>{text}</div>;
}
