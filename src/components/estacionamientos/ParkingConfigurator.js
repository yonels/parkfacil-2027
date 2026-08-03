"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const STATUS_STYLES = {
  COMPLETADO: "bg-emerald-50 text-emerald-800",
  EN_PROCESO: "bg-blue-50 text-blue-800",
  NO_INICIADO: "bg-slate-100 text-slate-700",
  BLOQUEADO: "bg-amber-50 text-amber-800",
};

export default function ParkingConfigurator({ parkingId, review = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    let active = true;
    authenticatedFetch(`/api/estacionamientos/${parkingId}/${review ? "revision" : "configuracion"}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        if (active) setData(body.data);
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [parkingId, review]);

  async function changeType(type, confirmed = false) {
    setSaving(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${parkingId}/tipo`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, confirmed }),
      });
      const body = await response.json();
      if (response.status === 409) { setConfirmation({ type, summary: body.summary }); return; }
      if (!response.ok) throw new Error(body.error);
      setConfirmation(null); setData(body.data);
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }

  async function activate() {
    if (!window.confirm("¿Confirmas la activación del estacionamiento?")) return;
    setSaving(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${parkingId}/activar`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.details?.join(" ") || body.error);
      setData(body.data);
    } catch (cause) { setError(cause.message); } finally { setSaving(false); }
  }

  if (loading) return <State text="Cargando configuración…" />;
  if (error && !data) return <State text={error} error />;
  const p = data.parking;
  const isOff = data.type === "OFF_STREET";
  return <div className="space-y-5">
    <Link href={review ? `/estacionamientos/${p.code}/configuracion` : `/estacionamientos/${p.code}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[#3150D8] hover:text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver</Link>
    {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-sm font-semibold text-[#3150D8]">{p.companyName}</p><h1 className="mt-1 text-2xl font-bold text-[#041E42]">{review ? "Revisión final" : "Configurar estacionamiento"}</h1><p className="mt-1 text-slate-600">{p.name} · {isOff ? "Off Street" : "On Street"}</p></div>
        {!review && (hasOperationalData(data.summary) ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Modalidad fija:</strong> para operar con el otro modelo debes cerrar o suspender este estacionamiento y crear uno nuevo relacionado.</div> : <div className="flex flex-wrap gap-2"><button disabled={saving || isOff} onClick={() => changeType("OFF_STREET")} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold disabled:bg-[#3150D8] disabled:text-white">Off Street</button><button disabled={saving || !isOff} onClick={() => changeType("ON_STREET")} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold disabled:bg-[#3150D8] disabled:text-white">On Street</button></div>)}
      </div>
      <div className="mt-5"><div className="flex justify-between text-sm"><span>Progreso</span><strong>{data.progress}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#3150D8]" style={{ width: `${data.progress}%` }} /></div></div>
    </section>
    <Summary data={data.summary} off={isOff} />
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="space-y-2">{data.steps.map((step, index) => <Step key={step.key} step={step} index={index} data={data} />)}</section>
      <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-[#041E42]">Requisitos de activación</h2>{data.activation.requirements.length ? <ul className="mt-3 space-y-2 text-sm text-slate-600">{data.activation.requirements.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-3 text-sm text-emerald-700">Configuración lista para activar.</p>}<button disabled={!data.activation.allowed || saving} onClick={activate} className="mt-5 w-full rounded-full bg-[#3150D8] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Procesando…" : "Activar estacionamiento"}</button></aside>
    </div>
    {confirmation && <ConfirmChange confirmation={confirmation} saving={saving} cancel={() => setConfirmation(null)} accept={() => changeType(confirmation.type, true)} />}
  </div>;
}

function Summary({ data, off }) {
  const items = off ? [["Niveles", data.levelCount], ["Zonas", data.zoneCount]] : [["Áreas", data.sectorCount], ["Calles", data.streetCount], ["Tramos", data.segmentCount], ["Asignaciones", data.assignmentCount], ["Turnos", data.shiftCount]];
  items.push(["Capacidad", data.capacity], ["Ocupadas", data.occupied], ["Disponibles", data.available]);
  return <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">{items.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-[#041E42]">{value}</p></div>)}</section>;
}
function hasOperationalData(summary) {
  return ["levelCount", "zoneCount", "sectorCount", "streetCount", "segmentCount", "assignmentCount", "shiftCount", "rateCount"].some((key) => Number(summary?.[key] || 0) > 0);
}
function Step({ step, index, data }) {
  const href = step.key === "general" ? `/estacionamientos/${data.parking.code}/editar` : step.key === "review" ? `/estacionamientos/${data.parking.code}/configuracion/revision` : step.key === "rates" ? `/estacionamientos/${data.parking.code}/tarifas` : ["levels", "zones", "sectors", "streets", "segments", "capacity"].includes(step.key) ? data.structureRoute : null;
  return <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-[#041E42]">{index + 1}</span><div className="min-w-0 flex-1"><h2 className="font-semibold text-[#041E42]">{step.label}</h2><p className="truncate text-sm text-slate-500">{step.detail}</p></div><span className={`hidden rounded-full px-2.5 py-1 text-xs font-semibold sm:block ${STATUS_STYLES[step.status] || "bg-slate-100"}`}>{step.status.replaceAll("_", " ")}</span>{href && <Link href={href} className="shrink-0 text-sm font-semibold text-[#3150D8]">Abrir</Link>}</article>;
}
function ConfirmChange({ confirmation, saving, cancel, accept }) {
  const s = confirmation.summary || {};
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold text-[#041E42]">Confirmar cambio de esquema</h2><p className="mt-2 text-sm text-slate-600">La configuración actual quedará archivada, no eliminada.</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><p>Sectores: {s.sectors || 0}</p><p>Calles: {s.streets || 0}</p><p>Niveles: {s.levels || 0}</p><p>Zonas: {s.zones || 0}</p><p>Capacidad: {s.capacity || 0}</p><p>Asignaciones: {s.assignments || 0}</p></div><div className="mt-6 flex justify-end gap-2"><button onClick={cancel} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={saving} onClick={accept} className="rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white">Modificar esquema</button></div></div></div>;
}
function State({ text, error }) { return <div className={`rounded-3xl border p-8 text-center ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-600"}`}>{text}</div>; }
