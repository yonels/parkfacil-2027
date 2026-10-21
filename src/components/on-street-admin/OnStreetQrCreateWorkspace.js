"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Check, Download, ExternalLink, Printer } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { publicOriginFor } from "@/lib/onStreetPilot.mjs";
import { sortOrderToLetter } from "@/lib/parkingSegments.mjs";

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);

function subscribeOrigin() {
  return () => {};
}

function sanitizeFileName(value) {
  return String(value || "qr-on-street").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "qr-on-street";
}

const STEPS = [
  { n: 1, label: "Ubicación" },
  { n: 2, label: "Tarifa" },
  { n: 3, label: "Datos del operador" },
  { n: 4, label: "Generar QR" },
  { n: 5, label: "Vista previa" },
];

function StepIndicator({ current, steps }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {steps.map((step, index) => (
        <li key={step.n} className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${step.n < current ? "bg-emerald-100 text-emerald-700" : step.n === current ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-400"}`}>
            {step.n < current ? <Check className="h-4 w-4" /> : step.n}
          </span>
          <span className={step.n === current ? "text-[#041E42]" : "text-slate-400"}>{step.label}</span>
          {index < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-slate-200" /> : null}
        </li>
      ))}
    </ol>
  );
}

// Asistente de creación de punto QR On Street, en los 5 pasos pedidos. Cada
// paso usa datos reales del sistema (jerarquía, tarifa resuelta en vivo,
// contacto del operador); el QR y su URL pública solo se generan al llegar
// al paso 4 (Generar QR), que es cuando realmente se crea la ubicación en
// el servidor. Nada aquí es una imagen estática ni un mock.
// parkingId/compact/onCreated (corrección UX/funcional "Proyectos On
// Street" 2026-08-29, punto 1): permiten EMBEBER este mismo generador --
// sin duplicarlo -- dentro de la pestaña QR de la ficha de Proyecto
// (OnStreetProjectQrPanel.js), en vez de navegar a otra página. parkingId
// fijo omite el selector de Estacionamiento (ya se conoce) y compact salta
// el paso 3 "Datos del operador" (solo informativo, no pide nada) para ir
// directo de Tarifa a Generar QR -- pidiendo únicamente Área/Calle/Tramo/
// Nombre/Tarifa, tal como se pidió. El uso standalone (/on-street-qr/crear)
// sigue funcionando exactamente igual, sin estos props.
// initialSectorId/initialStreetId/initialSegmentId/initialRateId (corrección
// UX 2026-08-30 -- "Tarifas dentro del árbol de Estructura"): cuando se llega
// desde el nivel 5 (Tarifa) del constructor de Proyecto con TODA la
// jerarquía ya resuelta (Área/Calle/Tramo/Tarifa), se precarga TODO y se
// salta directo al resumen + nombre + Generar QR -- nunca se vuelve a
// preguntar. Solo se aplican UNA vez (al montar, si vienen completos);
// "+ Crear otro QR" después usa el flujo compacto normal (elegir otra
// combinación), no repite este precargado.
export default function OnStreetQrCreateWorkspace({ parkingId: fixedParkingId = null, initialSectorId = null, initialStreetId = null, initialSegmentId = null, initialRateId = null, initialRateLabel = null, compact = false, onCreated } = {}) {
  const origin = useSyncExternalStore(subscribeOrigin, () => (typeof window !== "undefined" ? window.location.origin : ""), () => "");

  const [step, setStep] = useState(1);
  const [options, setOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");

  const [form, setForm] = useState({ parkingId: "", sectorId: "", streetId: "", segmentId: "", rateId: "", label: "", status: "ACTIVE" });
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);
  const [dataUrl, setDataUrl] = useState("");

  const cargarOpciones = useCallback(async () => {
    setLoadingOptions(true);
    setOptionsError("");
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations/options", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("SESSION_EXPIRED");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las opciones.");
      setOptions(body.data);
    } catch (cause) {
      setOptionsError(cause.message);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => cargarOpciones(), 0);
    return () => window.clearTimeout(timer);
  }, [cargarOpciones]);

  // Contexto precargado (§6 "Guardar y generar QR" del constructor de
  // Proyecto On Street 2026-08-28): cuando se llega aquí desde la ficha de
  // un Proyecto con la jerarquía ya definida, se leen los ids de la URL
  // (?parkingId=&sectorId=&streetId=&segmentId=) y se preseleccionan --
  // nunca se vuelve a pedir Empresa/Estacionamiento/Área/Calle/Tramo que
  // ya se conocían. Mismo patrón ya usado en OnStreetWorkspace.js para
  // ?segmentId= (lectura directa de window.location, no useSearchParams).
  // Corrección "flujo QR dentro de Nuevo Proyecto" (2026-08-30): estos
  // initial* llegan como PROPS de un componente hermano de confianza (el
  // constructor de Proyecto, mismo árbol de React, misma sesión) que YA
  // resolvió y validó Área/Calle/Tramo/Tarifa contra sus propias fuentes
  // (options del wizard + GET .../tarifas completo). NO se revalidan contra
  // options.areas/streets/segments/rates de ESTE componente -- son un
  // conjunto más angosto (p. ej. options.rates solo trae billing_mode
  // EFFECTIVE_MINUTE, así que una tarifa real "Tramo vencido" nunca
  // aparecería ahí y el salto al resumen se quedaba pegado en el paso 1,
  // mostrando de nuevo el flujo antiguo -- esa era la causa real del bug).
  // El backend igual revalida todo en createOnStreetQrLocation (nunca
  // confía en IDs del frontend), así que confiar aquí en las props del
  // wizard no debilita ninguna verificación real. Solo se aplica UNA vez.
  const [initialPrefillApplied, setInitialPrefillApplied] = useState(false);
  useEffect(() => {
    if (!options || !fixedParkingId || initialPrefillApplied) return undefined;
    if (!(options.parkings || []).some((p) => p.id === fixedParkingId)) return undefined;
    const hasFullContext = Boolean(initialSegmentId && initialRateId);
    const timer = window.setTimeout(() => {
      setForm((current) => ({
        ...current,
        parkingId: fixedParkingId,
        sectorId: initialSectorId || current.sectorId,
        streetId: initialStreetId || current.streetId,
        segmentId: initialSegmentId || current.segmentId,
        rateId: initialRateId || current.rateId,
      }));
      // Jerarquía + tarifa YA resueltas de punta a punta (nivel 5 del
      // constructor): salta directo al resumen + nombre + Generar QR, sin
      // volver a mostrar los pasos de Ubicación/Tarifa.
      if (hasFullContext) setStep(4);
      setInitialPrefillApplied(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [options, fixedParkingId, initialSectorId, initialStreetId, initialSegmentId, initialRateId, initialPrefillApplied]);

  useEffect(() => {
    if (!options || fixedParkingId) return undefined;
    const params = new URLSearchParams(window.location.search);
    const parkingId = params.get("parkingId");
    if (!parkingId) return undefined;
    if (!(options.parkings || []).some((p) => p.id === parkingId)) return undefined;
    const sectorId = params.get("sectorId");
    const streetId = params.get("streetId");
    const segmentId = params.get("segmentId");
    const rateId = params.get("rateId");
    const timer = window.setTimeout(() => {
      setForm((current) => ({
        ...current,
        parkingId,
        sectorId: sectorId && (options.areas || []).some((a) => a.id === sectorId) ? sectorId : current.sectorId,
        streetId: streetId && (options.streets || []).some((s) => s.id === streetId) ? streetId : current.streetId,
        segmentId: segmentId && (options.segments || []).some((s) => s.id === segmentId) ? segmentId : current.segmentId,
        // rateId también puede llegar preseleccionado, pero SOLO si es una
        // tarifa real de este estacionamiento -- nunca se asume, se valida
        // igual que el resto de la jerarquía.
        rateId: rateId && (options.rates || []).some((r) => r.id === rateId && r.parkingId === parkingId) ? rateId : current.rateId,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [options, fixedParkingId]);

  const parkings = useMemo(() => options?.parkings || [], [options]);
  const parkingSeleccionado = useMemo(() => parkings.find((p) => p.id === form.parkingId) || null, [parkings, form.parkingId]);
  const areasDelEstacionamiento = useMemo(() => (options?.areas || []).filter((a) => a.parkingId === form.parkingId), [options, form.parkingId]);
  const callesDelArea = useMemo(() => (options?.streets || []).filter((s) => s.sectorId === form.sectorId), [options, form.sectorId]);
  const tramosDeLaCalle = useMemo(() => (options?.segments || []).filter((s) => s.streetId === form.streetId), [options, form.streetId]);
  const tramoSeleccionado = useMemo(() => tramosDeLaCalle.find((s) => s.id === form.segmentId) || null, [tramosDeLaCalle, form.segmentId]);
  const areaSeleccionada = useMemo(() => areasDelEstacionamiento.find((a) => a.id === form.sectorId) || null, [areasDelEstacionamiento, form.sectorId]);
  // Decisión funcional "Proyectos On Street" (2026-08-29): el usuario elige
  // la tarifa de una lista real -- nunca se autoselecciona "la más
  // reciente"/"la activa genérica". Se listan TODAS las tarifas disponibles
  // del estacionamiento (no solo la del área elegida): un Proyecto puede
  // tener varias simultáneas (Normal/Comercial/Nocturna) sin relación fija
  // con un área en particular.
  const tarifasDisponibles = useMemo(() => (options?.rates || []).filter((r) => r.parkingId === form.parkingId), [options, form.parkingId]);
  const tarifaSeleccionada = useMemo(() => tarifasDisponibles.find((r) => r.id === form.rateId) || null, [tarifasDisponibles, form.rateId]);
  // Respaldo de exhibición (corrección "flujo QR dentro de Nuevo Proyecto",
  // 2026-08-30): si la tarifa precargada no aparece en options.rates (ese
  // listado es más angosto -- solo "Minuto efectivo" ACTIVE, ver arriba),
  // igual se muestra el nombre/monto real que ya resolvió el wizard, en vez
  // de "—". Nunca sustituye a tarifaSeleccionada cuando SÍ se encontró.
  const tarifaResumenTexto = tarifaSeleccionada ? `${tarifaSeleccionada.name} · ${money(tarifaSeleccionada.minuteAmount)}/min` : (form.rateId && form.rateId === initialRateId && initialRateLabel) ? initialRateLabel : "—";
  const calleSeleccionada = useMemo(() => callesDelArea.find((s) => s.id === form.streetId) || null, [callesDelArea, form.streetId]);

  // Nombre autocompletado (cierre integral del flujo, 2026-08-30, §29):
  // "Calle - Tramo X" en cuanto Calle y Tramo están elegidos. Sigue siendo
  // editable -- si el usuario lo modifica a mano, deja de sobrescribirse
  // (labelAutoOverridden). Nunca pisa un nombre ya escrito manualmente.
  const [labelAutoOverridden, setLabelAutoOverridden] = useState(false);
  useEffect(() => {
    if (labelAutoOverridden) return undefined;
    if (!calleSeleccionada || !tramoSeleccionado) return undefined;
    const letra = tramoSeleccionado.sortOrder != null ? sortOrderToLetter(tramoSeleccionado.sortOrder) : null;
    const sugerido = letra ? `${calleSeleccionada.name} - Tramo ${letra}` : `${calleSeleccionada.name} - ${tramoSeleccionado.name}`;
    const timer = window.setTimeout(() => {
      setForm((current) => (current.label === sugerido ? current : { ...current, label: sugerido }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calleSeleccionada, tramoSeleccionado, labelAutoOverridden]);

  const publicUrl = useMemo(() => (created && origin ? `${publicOriginFor(origin)}/estacionar/${created.public_code}` : ""), [created, origin]);

  useEffect(() => {
    let active = true;
    if (!publicUrl) return undefined;
    QRCode.toDataURL(publicUrl, { errorCorrectionLevel: "M", margin: 2, scale: 10, type: "image/png", color: { dark: "#041E42", light: "#FFFFFF" } })
      .then((next) => { if (active) setDataUrl(next); })
      .catch(() => { if (active) setDataUrl(""); });
    return () => { active = false; };
  }, [publicUrl]);

  function actualizar(campo, valor) {
    setForm((current) => {
      const next = { ...current, [campo]: valor };
      if (campo === "parkingId") { next.sectorId = ""; next.streetId = ""; next.segmentId = ""; next.rateId = ""; }
      if (campo === "sectorId") { next.streetId = ""; next.segmentId = ""; }
      if (campo === "streetId") { next.segmentId = ""; }
      return next;
    });
  }

  const paso1Completo = Boolean(form.parkingId && form.sectorId && form.streetId && form.segmentId && form.label.trim() && !tramoSeleccionado?.hasQr);
  const paso2Completo = Boolean(form.rateId);

  async function generarQr() {
    setSubmitError("");
    if (tramoSeleccionado?.hasQr) {
      setSubmitError("Ese tramo ya tiene una ubicación QR asignada.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible crear la ubicación QR.");
      setCreated(body.data);
      setStep(5);
      await cargarOpciones();
      if (onCreated) onCreated(body.data);
    } catch (cause) {
      setSubmitError(cause.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownload() {
    if (!dataUrl || !created) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${sanitizeFileName(form.label)}.png`;
    link.click();
  }

  function handlePrint() {
    if (!dataUrl) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=520,height=680");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${form.label}</title><style>body{font-family:Arial,sans-serif;margin:32px;text-align:center;color:#041E42}img{width:280px;height:280px}</style></head><body><img src="${dataUrl}" alt="Código QR"/><script>window.onload=function(){window.print();window.close();}</script></body></html>`);
    printWindow.document.close();
  }

  function crearOtra() {
    setCreated(null);
    setDataUrl("");
    setForm({ parkingId: fixedParkingId || "", sectorId: "", streetId: "", segmentId: "", rateId: "", label: "", status: "ACTIVE" });
    setLabelAutoOverridden(false);
    setStep(1);
  }

  if (loadingOptions) {
    return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></section>;
  }

  if (optionsError) {
    return <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{optionsError === "SESSION_EXPIRED" ? "Tu sesión expiró. Vuelve a iniciar sesión." : optionsError}</p>;
  }

  if (!parkings.length) {
    return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">No tienes estacionamientos On Street disponibles. Configura un estacionamiento On Street con al menos un tramo activo antes de crear un QR.</div></section>;
  }

  const visibleSteps = compact ? STEPS.filter((s) => s.n !== 3) : STEPS;

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <StepIndicator current={step} steps={visibleSteps} />
      </div>

      {step === 1 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">1. Ubicación</h2>
          <p className="mt-1 text-sm text-slate-500">{fixedParkingId ? "Selecciona el área, la calle y el tramo exacto donde se instalará este QR." : "Selecciona el estacionamiento On Street y el tramo exacto donde se instalará este QR."}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {fixedParkingId ? (
              <div className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-500">Estacionamiento</span>
                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-[#041E42]">{parkingSeleccionado?.name || "…"}</p>
              </div>
            ) : (
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-medium text-slate-500">Estacionamiento</span>
                <select value={form.parkingId} onChange={(event) => actualizar("parkingId", event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]">
                  <option value="">Selecciona un estacionamiento</option>
                  {parkings.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.companyName})</option>)}
                </select>
              </label>
            )}
            <label className="block space-y-1.5 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Área</span>
              <select value={form.sectorId} onChange={(event) => actualizar("sectorId", event.target.value)} disabled={!form.parkingId} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)] disabled:bg-slate-100">
                <option value="">Selecciona un área</option>
                {areasDelEstacionamiento.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Calle</span>
              <select value={form.streetId} onChange={(event) => actualizar("streetId", event.target.value)} disabled={!form.sectorId} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)] disabled:bg-slate-100">
                <option value="">Selecciona una calle</option>
                {callesDelArea.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Tramo</span>
              <select value={form.segmentId} onChange={(event) => actualizar("segmentId", event.target.value)} disabled={!form.streetId} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)] disabled:bg-slate-100">
                <option value="">Selecciona un tramo</option>
                {tramosDeLaCalle.map((s) => <option key={s.id} value={s.id} disabled={s.hasQr}>{s.code} · {s.name}{s.hasQr ? " (ya tiene QR)" : ""}</option>)}
              </select>
            </label>
          </div>
          {tramoSeleccionado ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <b>Lado:</b> {tramoSeleccionado.side || "—"}
              {tramoSeleccionado.hasQr ? <p className="mt-1 font-semibold text-rose-700">Este tramo ya tiene una ubicación QR asignada.</p> : null}
            </div>
          ) : null}
          <label className="mt-4 block space-y-1.5 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Nombre o descripción de la ubicación</span>
            <input value={form.label} onChange={(event) => { setLabelAutoOverridden(true); actualizar("label", event.target.value); }} placeholder="Ej: QR entrada norte, frente al poste 5" maxLength={120} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]" />
          </label>
          <div className="mt-6 flex justify-end">
            <button type="button" disabled={!paso1Completo} onClick={() => setStep(2)} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Siguiente: Tarifa</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">2. Tarifa</h2>
          <p className="mt-1 text-sm text-slate-500">Elige la tarifa concreta que cobrará este punto QR. Un estacionamiento puede tener varias tarifas disponibles a la vez (p. ej. Normal, Comercial, Nocturna) — nunca se asigna sola la más reciente ni una &quot;activa genérica&quot;.</p>
          {tarifasDisponibles.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-lg font-bold text-rose-700">Sin tarifas disponibles</p>
              <p className="mt-1 text-sm text-slate-600">Configura al menos una tarifa &quot;Minuto efectivo&quot; para este estacionamiento antes de continuar.</p>
              <Link href={`/on-street-qr/tarifas?parkingId=${form.parkingId}`} className="mt-2 inline-block text-sm font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">Ir a Tarifas →</Link>
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {tarifasDisponibles.map((rate) => (
                <button type="button" key={rate.id} onClick={() => actualizar("rateId", rate.id)} className={`rounded-2xl border-2 p-4 text-left transition ${form.rateId === rate.id ? "border-[var(--pf-color-onstreet-primary)] bg-[var(--pf-color-onstreet-tint)]" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <p className="font-semibold text-[#041E42]">{rate.name}</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700">{money(rate.minuteAmount)}<span className="text-sm font-semibold text-slate-500">/min</span></p>
                </button>
              ))}
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
            <button type="button" disabled={!paso2Completo} onClick={() => setStep(compact ? 4 : 3)} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{compact ? "Siguiente: Generar QR" : "Siguiente: Datos del operador"}</button>
          </div>
        </section>
      ) : null}

      {step === 3 && !compact ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">3. Datos del operador</h2>
          <p className="mt-1 text-sm text-slate-500">Estos son los datos de contacto reales de la empresa, tal como aparecerán en el letrero y en la pantalla pública del automovilista.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Operador</p><p className="mt-1 font-semibold text-[#041E42]">{parkingSeleccionado?.operator?.tradeName}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">RUT</p><p className="mt-1 font-semibold text-[#041E42]">{parkingSeleccionado?.operator?.rut || "No informado"}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Correo de contacto</p><p className="mt-1 font-semibold text-[#041E42]">{parkingSeleccionado?.operator?.email || "No informado"}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="text-xs font-semibold uppercase text-slate-500">Teléfono de contacto</p><p className="mt-1 font-semibold text-[#041E42]">{parkingSeleccionado?.operator?.phone || "No informado"}</p></div>
          </div>
          <p className="mt-4 text-xs text-slate-500">¿Falta o está mal algún dato? Se administra desde la ficha de la empresa, no desde aquí.</p>
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(2)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
            <button type="button" onClick={() => setStep(4)} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white">Siguiente: Generar QR</button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">4. Generar QR</h2>
          <p className="mt-1 text-sm text-slate-500">Revisa el resumen y confirma. El código QR lo genera el servidor en este paso (impredecible, no secuencial) — no existe todavía hasta que confirmes aquí.</p>
          <dl className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Nombre</dt><dd className="font-semibold text-[#041E42]">{form.label}</dd></div>
            <div><dt className="text-slate-500">Estacionamiento</dt><dd className="font-semibold text-[#041E42]">{parkingSeleccionado?.name}</dd></div>
            <div><dt className="text-slate-500">Ubicación</dt><dd className="font-semibold text-[#041E42]">{areaSeleccionada?.name} · {callesDelArea.find((s) => s.id === form.streetId)?.name} · {tramoSeleccionado?.name}</dd></div>
            <div><dt className="text-slate-500">Tarifa</dt><dd className="font-semibold text-[#041E42]">{tarifaResumenTexto}</dd></div>
          </dl>
          <label className="mt-4 block max-w-xs space-y-1.5 text-sm text-slate-700">
            <span className="font-medium text-slate-500">Estado inicial</span>
            <select value={form.status} onChange={(event) => actualizar("status", event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]">
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </label>
          {submitError ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{submitError}</p> : null}
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(compact ? 2 : 3)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
            <button type="button" disabled={submitting} onClick={generarQr} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{submitting ? "Generando…" : "Generar QR"}</button>
          </div>
        </section>
      ) : null}

      {step === 5 && created ? (
        <section className="rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-6">
          <h2 className="text-lg font-semibold text-[#041E42]">5. Vista previa</h2>
          <p className="mt-1 text-sm text-slate-600">Ubicación QR creada correctamente. Esto es lo que verá el automovilista al escanear.</p>
          <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl bg-white p-6 sm:flex-row sm:items-start">
            <div className="flex justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {dataUrl ? <img src={dataUrl} alt={`Código QR de ${form.label}`} className="h-48 w-48 object-contain" /> : <span className="text-sm text-slate-500">Generando QR…</span>}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-[#041E42]">{form.label}</p>
              <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{publicUrl}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={handleDownload} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] disabled:opacity-50"><Download className="h-4 w-4" />Descargar</button>
                <button type="button" onClick={handlePrint} disabled={!dataUrl} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42] disabled:opacity-50"><Printer className="h-4 w-4" />Imprimir</button>
                <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#041E42]"><ExternalLink className="h-4 w-4" />Abrir</a>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/on-street-qr/ubicaciones/${created.id}`} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white">Ver ficha del punto</Link>
            <Link href={`/on-street-qr/ubicaciones/${created.id}/letrero`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Ver letrero</Link>
            <button type="button" onClick={crearOtra} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Crear otro punto</button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
