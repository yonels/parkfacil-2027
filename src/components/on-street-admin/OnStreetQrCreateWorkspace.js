"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Check, Download, ExternalLink, Printer } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { publicOriginFor } from "@/lib/onStreetPilot.mjs";

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

function StepIndicator({ current }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {STEPS.map((step, index) => (
        <li key={step.n} className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${step.n < current ? "bg-emerald-100 text-emerald-700" : step.n === current ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-400"}`}>
            {step.n < current ? <Check className="h-4 w-4" /> : step.n}
          </span>
          <span className={step.n === current ? "text-[#041E42]" : "text-slate-400"}>{step.label}</span>
          {index < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-slate-200" /> : null}
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
export default function OnStreetQrCreateWorkspace() {
  const origin = useSyncExternalStore(subscribeOrigin, () => (typeof window !== "undefined" ? window.location.origin : ""), () => "");

  const [step, setStep] = useState(1);
  const [options, setOptions] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");

  const [form, setForm] = useState({ parkingId: "", sectorId: "", streetId: "", segmentId: "", label: "", status: "ACTIVE" });
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

  const parkings = useMemo(() => options?.parkings || [], [options]);
  const parkingSeleccionado = useMemo(() => parkings.find((p) => p.id === form.parkingId) || null, [parkings, form.parkingId]);
  const areasDelEstacionamiento = useMemo(() => (options?.areas || []).filter((a) => a.parkingId === form.parkingId), [options, form.parkingId]);
  const callesDelArea = useMemo(() => (options?.streets || []).filter((s) => s.sectorId === form.sectorId), [options, form.sectorId]);
  const tramosDeLaCalle = useMemo(() => (options?.segments || []).filter((s) => s.streetId === form.streetId), [options, form.streetId]);
  const tramoSeleccionado = useMemo(() => tramosDeLaCalle.find((s) => s.id === form.segmentId) || null, [tramosDeLaCalle, form.segmentId]);
  const areaSeleccionada = useMemo(() => areasDelEstacionamiento.find((a) => a.id === form.sectorId) || null, [areasDelEstacionamiento, form.sectorId]);

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
      if (campo === "parkingId") { next.sectorId = ""; next.streetId = ""; next.segmentId = ""; }
      if (campo === "sectorId") { next.streetId = ""; next.segmentId = ""; }
      if (campo === "streetId") { next.segmentId = ""; }
      return next;
    });
  }

  const paso1Completo = Boolean(form.parkingId && form.sectorId && form.streetId && form.segmentId && form.label.trim() && !tramoSeleccionado?.hasQr);
  const paso2Completo = Boolean(areaSeleccionada?.rate);

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
    setForm({ parkingId: "", sectorId: "", streetId: "", segmentId: "", label: "", status: "ACTIVE" });
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

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <StepIndicator current={step} />
      </div>

      {step === 1 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">1. Ubicación</h2>
          <p className="mt-1 text-sm text-slate-500">Selecciona el estacionamiento On Street y el tramo exacto donde se instalará este QR.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm text-slate-700">
              <span className="font-medium text-slate-500">Estacionamiento</span>
              <select value={form.parkingId} onChange={(event) => actualizar("parkingId", event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]">
                <option value="">Selecciona un estacionamiento</option>
                {parkings.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.companyName})</option>)}
              </select>
            </label>
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
            <input value={form.label} onChange={(event) => actualizar("label", event.target.value)} placeholder="Ej: QR entrada norte, frente al poste 5" maxLength={120} className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:border-[var(--pf-color-onstreet-primary)]" />
          </label>
          <div className="mt-6 flex justify-end">
            <button type="button" disabled={!paso1Completo} onClick={() => setStep(2)} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Siguiente: Tarifa</button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[#041E42]">2. Tarifa</h2>
          <p className="mt-1 text-sm text-slate-500">La tarifa no se guarda en el punto: se resuelve en vivo desde el motor tarifario del estacionamiento, igual que en el cobro real, para que nunca quede desactualizada.</p>
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm text-slate-500">{parkingSeleccionado?.name} · {areaSeleccionada?.name}</p>
            {areaSeleccionada?.rate ? (
              <p className="mt-2 text-3xl font-black text-emerald-700">{money(areaSeleccionada.rate.minuteAmount)}<span className="text-base font-semibold text-slate-500">/min</span></p>
            ) : (
              <div className="mt-2">
                <p className="text-lg font-bold text-rose-700">Sin tarifa vigente configurada</p>
                <p className="mt-1 text-sm text-slate-600">Configura una tarifa &quot;Minuto efectivo&quot; antes de continuar.</p>
                <Link href="/on-street-qr/tarifas" className="mt-2 inline-block text-sm font-semibold text-[var(--pf-color-onstreet-primary)] hover:underline">Ir a Configuración / Tarifas →</Link>
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
            <button type="button" disabled={!paso2Completo} onClick={() => setStep(3)} className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Siguiente: Datos del operador</button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
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
            <div><dt className="text-slate-500">Tarifa</dt><dd className="font-semibold text-[#041E42]">{areaSeleccionada?.rate ? `${money(areaSeleccionada.rate.minuteAmount)}/min` : "—"}</dd></div>
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
            <button type="button" onClick={() => setStep(3)} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
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
