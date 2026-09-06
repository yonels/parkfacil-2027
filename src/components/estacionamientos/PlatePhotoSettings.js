"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Folder } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const MODE_OPTIONS = [
  { value: "DISABLED", label: "Desactivada", detail: "No se muestra ningún control de cámara. El flujo de ingreso queda exactamente igual al actual." },
  { value: "OPTIONAL", label: "Opcional", detail: "El operador puede tomar la fotografía o continuar sin ella." },
  { value: "REQUIRED", label: "Obligatoria", detail: "No se puede confirmar el ingreso sin una fotografía válida de la patente." },
];

const GPS_MODE_OPTIONS = [
  { value: "DISABLED", label: "Desactivada", detail: "No se solicita ubicación por esta funcionalidad." },
  { value: "OPTIONAL", label: "Opcional", detail: "Se registra la ubicación cuando el dispositivo la entrega; nunca bloquea el ingreso si no está disponible." },
  { value: "REQUIRED", label: "Obligatoria", detail: "La evidencia no queda completa sin una posición GPS válida." },
];

export default function PlatePhotoSettings({ parkingId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [plateMode, setPlateMode] = useState("DISABLED");
  const [printOnTicket, setPrintOnTicket] = useState(false);
  const [gpsMode, setGpsMode] = useState("DISABLED");

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
        setGpsMode(body.data.gpsMode || "DISABLED");
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [parkingId]);

  // Dependencia estricta (§5 del encargo): la fotografía es la condición
  // habilitante de todo lo demás -- imprimir en ticket y GPS asociado no
  // tienen sentido sin evidencia a la que referirse. El backend vuelve a
  // aplicar esta misma regla (setPlatePhotoSettings fuerza gpsMode a
  // DISABLED si plateMode es DISABLED) -- esto en la UI es para que el
  // operador administrativo lo vea con claridad, no la única barrera.
  const photoEnabled = plateMode !== "DISABLED";

  async function save() {
    setSaving(true); setError(""); setFeedback("");
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${parkingId}/configuracion/foto-patente`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plateMode, printOnTicket, gpsMode, evidenceRetentionDays: data?.evidenceRetentionDays ?? null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body.data);
      setPlateMode(body.data.plateMode);
      setPrintOnTicket(Boolean(body.data.printOnTicket));
      setGpsMode(body.data.gpsMode || "DISABLED");
      setFeedback("Configuración guardada.");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <State text="Cargando configuración…" />;
  if (error && !data) return <State text={error} error />;

  const dirty = data && (
    plateMode !== data.plateMode
    || printOnTicket !== Boolean(data.printOnTicket)
    || gpsMode !== (data.gpsMode || "DISABLED")
  );

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

        {/* Modelo jerárquico con carpetas: esta funcionalidad es un
            SERVICIO CONTRATADO del estacionamiento, no un ajuste técnico
            aislado (§1/§4/§28 del encargo). Ambas carpetas abiertas por
            defecto -- el administrador llegó a esta pantalla específicamente
            a configurar esto. */}
        <details open className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-[#041E42]">
            <Folder className="h-4 w-4 text-[#3150D8]" /> Servicios contratados
          </summary>
          <div className="border-t border-slate-200 px-4 pb-4 pt-3">
            <details open className="rounded-xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-[#041E42]">
                <Folder className="h-4 w-4 text-[#3150D8]" /> Evidencia de patente
              </summary>
              <div className="space-y-5 border-t border-slate-200 p-4">
                <fieldset className="space-y-3">
                  <legend className="text-sm font-bold text-slate-700">Estado y modo</legend>
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

                <label className={`flex items-start gap-3 rounded-2xl border p-4 ${photoEnabled ? "cursor-pointer border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                  <input
                    type="checkbox"
                    checked={printOnTicket}
                    disabled={!photoEnabled}
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

                {/* Ubicación GPS: sub-carpeta propia dentro de Evidencia de
                    patente (§19 del encargo), misma dependencia que
                    "Imprimir foto" -- deshabilitada mientras la foto esté
                    Desactivada. */}
                <details open={photoEnabled} className={`rounded-xl border ${photoEnabled ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"}`}>
                  <summary className={`flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-black ${photoEnabled ? "text-[#041E42]" : "text-slate-400"}`}>
                    <Folder className={`h-4 w-4 ${photoEnabled ? "text-[#3150D8]" : "text-slate-300"}`} /> Ubicación GPS
                  </summary>
                  <div className="space-y-3 border-t border-slate-200 p-4">
                    {!photoEnabled ? (
                      <p className="text-sm text-slate-400">Activa primero la fotografía de patente para configurar el GPS asociado.</p>
                    ) : (
                      GPS_MODE_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition ${gpsMode === option.value ? "border-[#3150D8] bg-[#F5F9FF]" : "border-slate-200 bg-white hover:border-slate-300"}`}
                        >
                          <input
                            type="radio"
                            name="gpsMode"
                            value={option.value}
                            checked={gpsMode === option.value}
                            onChange={() => setGpsMode(option.value)}
                            className="mt-1"
                          />
                          <span>
                            <span className="block font-semibold text-[#041E42]">{option.label}</span>
                            <span className="block text-sm text-slate-600">{option.detail}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </details>

                {/* Fecha/hora y operador/dispositivo: no son un switch --
                    se registran siempre que exista fotografía, de forma
                    automática (§16/§17/§20). Se muestran como informativos
                    para que quede claro qué trazabilidad queda guardada,
                    sin simular un control que no existe. */}
                <div className={`rounded-2xl border p-4 text-sm ${photoEnabled ? "border-slate-200 bg-white text-slate-600" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
                  <p className="font-semibold text-[#041E42]">Trazabilidad automática de cada fotografía</p>
                  <ul className="mt-2 space-y-1">
                    <li>✓ Fecha y hora exacta de la captura</li>
                    <li>✓ Operador autenticado que registró el ingreso</li>
                    <li>✓ Dispositivo utilizado (modelo y versión de la app)</li>
                    <li>✓ Hash de integridad (SHA-256) de la imagen guardada</li>
                  </ul>
                  {!photoEnabled ? <p className="mt-2 text-xs">No aplica mientras la fotografía esté desactivada.</p> : null}
                </div>
              </div>
            </details>
          </div>
        </details>

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
