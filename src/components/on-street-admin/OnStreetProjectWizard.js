"use client";
// Constructor "Nuevo proyecto" (corrección UX 2026-08-30 -- "Tarifas dentro
// del árbol de Estructura"): Estacionamiento -> Área -> Calle -> Tramo ->
// Tarifa son los 5 niveles de UN MISMO árbol "Estructura". Tabs superiores:
// Estructura -> QR -> Revisión. Reutiliza EXACTAMENTE los mismos
// formularios/componentes/endpoints ya existentes (EstacionamientoForm,
// StructureEntityForm, OnStreetSegmentForm, ParkingRatesManager,
// OnStreetProjectQrPanel, OnStreetProjectActivation) -- ninguno se duplica.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, X } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";
import EstacionamientoForm from "@/components/estacionamientos/EstacionamientoForm";
import StructureEntityForm from "@/components/estacionamientos/StructureEntityForm";
import ParkingRatesManager from "@/components/estacionamientos/ParkingRatesManager";
import OnStreetSegmentForm from "./OnStreetSegmentForm";
import OnStreetProjectQrPanel from "./OnStreetProjectQrPanel";
import OnStreetProjectActivation from "./OnStreetProjectActivation";

const STAGES = [
  { key: "estructura", label: "1. Estructura" },
  { key: "qr", label: "2. QR" },
  { key: "revision", label: "3. Revisión" },
];
const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#041E42]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Un nivel de la cascada: check de progreso, selector de existentes,
// "+ Crear nuevo" y "Editar" -- mismo patrón visual para los 5 niveles
// (Estacionamiento/Área/Calle/Tramo/Tarifa).
function NivelCascada({ numero, titulo, done, doneLabel, placeholder, disabled, value, options: opts, onChange, onCrear, crearLabel = "Crear nuevo", onEditar }) {
  return (
    <div className={`rounded-3xl border-2 p-5 ${done ? "border-[var(--pf-color-onstreet-primary)] bg-[#FFF9F4]" : "border-dashed border-slate-300"}`}>
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-200 text-slate-500"}`}>
          {done ? <Check className="h-4 w-4" /> : numero}
        </span>
        <h3 className="font-black text-[#041E42]">{titulo}</h3>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
        <select disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100">
          <option value="">{placeholder}</option>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {done && onEditar ? <button type="button" onClick={onEditar} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"><Pencil className="h-4 w-4" />Editar</button> : null}
        <button type="button" disabled={disabled} onClick={onCrear} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-2xl bg-[var(--pf-color-onstreet-primary)] px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
          <Plus className="h-4 w-4" />{crearLabel}
        </button>
      </div>
      {done ? <p className="mt-2 pl-9 text-xs font-semibold text-slate-500">{doneLabel}</p> : null}
    </div>
  );
}

export default function OnStreetProjectWizard() {
  const router = useRouter();
  const [stage, setStage] = useState("estructura");
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [parkingId, setParkingId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [streetId, setStreetId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [modal, setModal] = useState(null); // { kind: "parking"|"area"|"street"|"segment"|"tarifa", editing: entity|null }

  // Nivel 5: Tarifa. Lista propia (registro COMPLETO -- billingMode/status/
  // compliance/etc, no el resumen de /locations/options) para poder ofrecer
  // Seleccionar/Crear/Editar reales, igual que el resto de niveles.
  const [tarifas, setTarifas] = useState([]);
  const [loadingTarifas, setLoadingTarifas] = useState(false);
  const [tarifaId, setTarifaId] = useState("");
  const [tarifaModalIntent, setTarifaModalIntent] = useState(null); // "crear" | "editar" | null
  const [tarifaRatesOpenSignal, setTarifaRatesOpenSignal] = useState(0);
  const pendingAutoSelectTarifa = tarifaModalIntent === "crear";

  // Corrección "flujo QR dentro de Nuevo Proyecto" (2026-08-30, punto 6):
  // "CONTINUAR A REVISIÓN" exige al menos un QR real creado -- lo reporta
  // OnStreetProjectQrPanel vía onCountChange, sin una segunda consulta.
  const [qrCount, setQrCount] = useState(0);
  const [revisionData, setRevisionData] = useState(null);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [revisionError, setRevisionError] = useState("");

  const cargarOpciones = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/on-street-qr/locations/options", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las opciones.");
      setOptions(body.data);
      return body.data;
    } catch (cause) {
      setError(cause.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await cargarOpciones();
      try {
        const response = await authenticatedFetch("/api/on-street-qr/companies", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (active && response.ok) setCompanies(body.data || []);
      } catch { /* Root ve el selector; company_admin no lo necesita */ }
    })();
    return () => { active = false; };
  }, [cargarOpciones]);

  const parkings = useMemo(() => (options?.parkings || []).filter((p) => !companyId || p.companyId === companyId), [options, companyId]);
  const areas = useMemo(() => (options?.areas || []).filter((a) => a.parkingId === parkingId), [options, parkingId]);
  const streets = useMemo(() => (options?.streets || []).filter((s) => s.sectorId === areaId), [options, areaId]);
  const segments = useMemo(() => (options?.segments || []).filter((s) => s.streetId === streetId), [options, streetId]);

  const parkingSel = useMemo(() => parkings.find((p) => p.id === parkingId) || null, [parkings, parkingId]);
  const areaSel = useMemo(() => areas.find((a) => a.id === areaId) || null, [areas, areaId]);
  const streetSel = useMemo(() => streets.find((s) => s.id === streetId) || null, [streets, streetId]);
  const segmentSel = useMemo(() => segments.find((s) => s.id === segmentId) || null, [segments, segmentId]);
  const tarifaSel = useMemo(() => tarifas.find((r) => r.id === tarifaId) || null, [tarifas, tarifaId]);
  // Solo tarifas ACTIVE + compliance VALID son realmente utilizables para un
  // QR (decisión funcional ya aprobada) -- una DRAFT o REQUIRES_REVIEW no
  // debe poder elegirse aquí ni habilitar continuar a QR.
  const tarifasUsables = useMemo(() => tarifas.filter((r) => r.status === "ACTIVE" && r.compliance?.status === "VALID"), [tarifas]);

  // Empresa única (company_admin): se autoselecciona y se muestra solo
  // como contexto, nunca se pide explícitamente.
  useEffect(() => {
    if (companies.length !== 1 || companyId) return undefined;
    const timer = window.setTimeout(() => setCompanyId(companies[0].id), 0);
    return () => window.clearTimeout(timer);
  }, [companies, companyId]);

  const cargarTarifas = useCallback(async () => {
    if (!parkingSel) return [];
    setLoadingTarifas(true);
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${parkingSel.code}/tarifas`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar las tarifas.");
      setTarifas(body.data || []);
      return body.data || [];
    } catch (cause) {
      setError(cause.message);
      return [];
    } finally {
      setLoadingTarifas(false);
    }
  }, [parkingSel]);

  // Tarifas del nivel 5 solo dependen del Estacionamiento (igual que la
  // pestaña Tarifas de la ficha) -- no de Área/Calle/Tramo.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!parkingSel) { setTarifas([]); setTarifaId(""); return; }
      void cargarTarifas();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [parkingSel, cargarTarifas]);

  function elegirEstacionamiento(id) { setParkingId(id); setAreaId(""); setStreetId(""); setSegmentId(""); setTarifaId(""); }
  function elegirArea(id) { setAreaId(id); setStreetId(""); setSegmentId(""); }
  function elegirCalle(id) { setStreetId(id); setSegmentId(""); }

  // Creación contextual: al guardar, la nueva entidad hereda el contexto ya
  // elegido, queda seleccionada automáticamente -- refrescando options para
  // que el resto de los selectores vean el dato real recién creado. Cerrar
  // el modal (setModal(null)) es lo ÚNICO que ocurre aquí -- nunca navega,
  // nunca resetea el resto del Proyecto.
  async function alGuardarEnModal(kind, entidad) {
    setModal(null);
    await cargarOpciones();
    if (kind === "parking") elegirEstacionamiento(entidad.id);
    if (kind === "area") elegirArea(entidad.id);
    if (kind === "street") elegirCalle(entidad.id);
    if (kind === "segment") setSegmentId(entidad.id);
  }

  // Tarifa (nivel 5): ParkingRatesManager reporta su lista completa vía
  // onRatesChange en cada carga/creación/edición/reemplazo -- se reutiliza
  // ese mismo estado para el selector del wizard, sin una segunda fuente de
  // verdad. Si el modal se abrió con intención "crear" y aparece una tarifa
  // nueva (length creció), se autoselecciona la más reciente (rates[0],
  // orden ya created_at desc) y se cierra el modal solo.
  function alCambiarTarifas(nuevasTarifas) {
    setTarifas((current) => {
      if (pendingAutoSelectTarifa && nuevasTarifas.length > current.length) {
        setTarifaId(nuevasTarifas[0].id);
        setTarifaModalIntent(null);
        setModal(null);
      }
      return nuevasTarifas;
    });
  }

  const empresaSel = companies.find((c) => c.id === companyId) || null;
  const requiereEmpresa = companies.length > 1;
  const estructuraCompleta = Boolean(parkingId && areaId && streetId && segmentId && tarifaId);

  const cargarRevision = useCallback(async () => {
    if (!parkingId) return;
    setRevisionLoading(true); setRevisionError("");
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/proyectos/${parkingId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el resumen del Proyecto.");
      setRevisionData(body.data);
    } catch (cause) {
      setRevisionError(cause.message);
    } finally {
      setRevisionLoading(false);
    }
  }, [parkingId]);

  function irA(nextStage) {
    setStage(nextStage);
    if (nextStage === "revision") void cargarRevision();
  }

  if (loading) return <AppShell title="Nuevo proyecto" description="Cargando"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></AppShell>;

  return (
    <AppShell title="Nuevo proyecto On Street" description="Proyectos On Street">
      <div className="mx-auto max-w-4xl space-y-6">
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500">
          <Link href="/on-street-qr" className="hover:text-[var(--pf-color-onstreet-primary)]">On Street</Link>
          <span>/</span>
          <Link href="/on-street-qr/proyectos" className="hover:text-[var(--pf-color-onstreet-primary)]">Proyectos On Street</Link>
          <span>/</span>
          <span className="text-slate-700">Nuevo proyecto</span>
        </nav>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#041E42]">Nuevo proyecto On Street</h1>
          {/* Salida completa del wizard: acción PADRE explícita, nunca un
              "Cancelar" de un formulario hijo. */}
          {/* "Salir" = Volver real de historial (2026-08-30) -- ver nota en OnStreetAdminPage.js. */}
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Salir</button>
        </div>

        {parkingSel ? (
          <div className="rounded-2xl bg-[#EEF4FF] px-4 py-3 text-sm">
            <span className="font-semibold text-slate-500">Proyecto</span>
            <p className="font-black text-[#041E42]">{parkingSel.name} · {parkingSel.companyName}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          {STAGES.map((s) => {
            const locked = (s.key !== "estructura" && !estructuraCompleta) || (s.key === "revision" && qrCount === 0);
            return (
              <button
                key={s.key} type="button" disabled={locked} onClick={() => irA(s.key)}
                title={locked ? (s.key === "revision" && estructuraCompleta ? "Crea al menos una ubicación QR primero" : "Completa Estacionamiento, Área, Calle, Tramo y Tarifa primero") : undefined}
                className={`rounded-t-xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${stage === s.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}

        {stage === "estructura" ? (
          <div className="space-y-6">
            <p className="text-sm text-slate-500">Define Estacionamiento, Área, Calle, Tramo y Tarifa. Cada nivel se guarda de inmediato -- puedes avanzar y volver sin perder nada.</p>

            {requiereEmpresa ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-300 p-5">
                <h3 className="font-black text-[#041E42]">Empresa</h3>
                <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); elegirEstacionamiento(""); }} className="mt-3 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="">Selecciona la empresa…</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : null}

            <NivelCascada
              numero={1} titulo="Estacionamiento" done={Boolean(parkingSel)} doneLabel={parkingSel?.name}
              placeholder="Selecciona o crea un estacionamiento…" disabled={requiereEmpresa && !companyId}
              value={parkingId} options={parkings.map((p) => ({ id: p.id, label: `${p.name}${p.companyName ? ` (${p.companyName})` : ""}` }))}
              onChange={elegirEstacionamiento}
              onCrear={() => setModal({ kind: "parking", editing: null })}
              onEditar={() => setModal({ kind: "parking", editing: parkingSel })}
            />

            <NivelCascada
              numero={2} titulo="Área" done={Boolean(areaSel)} doneLabel={areaSel ? `${areaSel.code ? `${areaSel.code} · ` : ""}${areaSel.name}` : ""}
              placeholder="Selecciona o crea un área…" disabled={!parkingId}
              value={areaId} options={areas.map((a) => ({ id: a.id, label: `${a.code ? `${a.code} · ` : ""}${a.name}` }))}
              onChange={elegirArea}
              onCrear={() => setModal({ kind: "area", editing: null })}
              onEditar={() => setModal({ kind: "area", editing: areaSel })}
            />

            <NivelCascada
              numero={3} titulo="Calle" done={Boolean(streetSel)} doneLabel={streetSel?.name}
              placeholder="Selecciona o crea una calle…" disabled={!areaId}
              value={streetId} options={streets.map((s) => ({ id: s.id, label: s.name }))}
              onChange={elegirCalle}
              onCrear={() => setModal({ kind: "street", editing: null })}
              onEditar={() => setModal({ kind: "street", editing: streetSel })}
            />

            <NivelCascada
              numero={4} titulo="Tramo" done={Boolean(segmentSel)} doneLabel={segmentSel ? `${segmentSel.code ? `${segmentSel.code} · ` : ""}${segmentSel.name}${segmentSel.hasQr ? " (ya tiene QR)" : ""}` : ""}
              placeholder="Selecciona o crea un tramo…" disabled={!streetId}
              value={segmentId} options={segments.map((s) => ({ id: s.id, label: `${s.code ? `${s.code} · ` : ""}${s.name}${s.hasQr ? " (ya tiene QR)" : ""}` }))}
              onChange={setSegmentId}
              onCrear={() => setModal({ kind: "segment", editing: null })}
              onEditar={() => setModal({ kind: "segment", editing: segmentSel })}
            />

            {/* Nivel 5: Tarifa. NO pertenece al Tramo -- es el catálogo de
                tarifas del Estacionamiento/Proyecto (varias pueden coexistir
                activas); esta es solo la que quedará preseleccionada al
                pasar a QR, donde igual puede cambiarse por otra del mismo
                Proyecto. */}
            <NivelCascada
              numero={5} titulo="Tarifa" done={Boolean(tarifaSel)}
              doneLabel={tarifaSel ? `${tarifaSel.name} — ${money(tarifaSel.minuteAmount)}/min` : ""}
              placeholder={loadingTarifas ? "Cargando tarifas…" : "Selecciona o crea una tarifa…"} disabled={!segmentId || loadingTarifas}
              value={tarifaId} options={tarifasUsables.map((r) => ({ id: r.id, label: `${r.name} — ${money(r.minuteAmount)}/min` }))}
              onChange={setTarifaId}
              crearLabel="Crear nueva"
              onCrear={() => { setTarifaModalIntent("crear"); setTarifaRatesOpenSignal((n) => n + 1); setModal({ kind: "tarifa" }); }}
              onEditar={() => { setTarifaModalIntent("editar"); setModal({ kind: "tarifa" }); }}
            />

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {!estructuraCompleta ? <p className="mb-3 text-sm text-slate-500">Completa Estacionamiento, Área, Calle, Tramo y Tarifa para continuar a QR.</p> : null}
              <div className="flex justify-end">
                <button type="button" disabled={!estructuraCompleta} onClick={() => irA("qr")} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--pf-color-onstreet-primary)] px-5 text-sm font-black text-white disabled:opacity-40">CONTINUAR A QR<ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ) : null}

        {stage === "qr" && parkingId ? (
          <div className="space-y-4">
            <OnStreetProjectQrPanel parkingId={parkingId} initialSectorId={areaId} initialStreetId={streetId} initialSegmentId={segmentId} initialRateId={tarifaId} initialRateLabel={tarifaSel ? `${tarifaSel.name} · ${money(tarifaSel.minuteAmount)}/min` : null} onCountChange={setQrCount} />
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              {qrCount === 0 ? <p className="mb-3 text-sm text-slate-500">Crea al menos una ubicación QR para continuar a Revisión.</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => irA("estructura")} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-slate-200 px-5 text-sm font-black text-slate-700"><ArrowLeft className="h-4 w-4" />Volver a Estructura</button>
                <button type="button" disabled={qrCount === 0} onClick={() => irA("revision")} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--pf-color-onstreet-primary)] px-5 text-sm font-black text-white disabled:opacity-40">CONTINUAR A REVISIÓN<ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ) : null}

        {stage === "revision" ? (
          <div className="space-y-4">
            {revisionLoading ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando resumen…</div>
            ) : revisionError ? (
              <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{revisionError}</p>
            ) : revisionData ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <OnStreetProjectActivation data={revisionData} onActivated={cargarRevision} />
              </div>
            ) : null}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => irA("qr")} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-slate-200 px-5 text-sm font-black text-slate-700"><ArrowLeft className="h-4 w-4" />Volver a QR</button>
                <button type="button" onClick={() => router.push(`/on-street-qr/proyectos/${parkingId}`)} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[var(--pf-color-onstreet-primary)] px-5 text-sm font-black text-white">VER FICHA COMPLETA DEL PROYECTO<ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {modal?.kind === "parking" ? (
        <Modal title={modal.editing ? "Editar estacionamiento" : "Nuevo estacionamiento"} onClose={() => setModal(null)}>
          <EstacionamientoForm parking={modal.editing} lockedCompanyId={companyId || undefined} forcedType="ON_STREET" onSaved={(data) => alGuardarEnModal("parking", data)} onCancel={() => setModal(null)} />
        </Modal>
      ) : null}
      {modal?.kind === "area" && parkingSel ? (
        <Modal title={modal.editing ? "Editar área" : "Nueva área"} onClose={() => setModal(null)}>
          <StructureEntityForm kind="sector" parking={parkingSel} entity={modal.editing} onSaved={(data) => alGuardarEnModal("area", data)} onCancel={() => setModal(null)} />
        </Modal>
      ) : null}
      {modal?.kind === "street" && parkingSel && areaSel ? (
        <Modal title={modal.editing ? "Editar calle" : "Nueva calle"} onClose={() => setModal(null)}>
          <StructureEntityForm kind="street" parking={parkingSel} parent={areaSel} entity={modal.editing} onSaved={(data) => alGuardarEnModal("street", data)} onCancel={() => setModal(null)} />
        </Modal>
      ) : null}
      {modal?.kind === "segment" && parkingSel && areaSel && streetSel ? (
        <Modal title={modal.editing ? "Editar tramo" : "Nuevo tramo"} onClose={() => setModal(null)}>
          <OnStreetSegmentForm
            parking={parkingSel} area={areaSel} street={streetSel} segmentId={modal.editing?.id || null}
            onSaved={(data) => alGuardarEnModal("segment", data)}
            onCancel={() => setModal(null)}
          />
        </Modal>
      ) : null}
      {modal?.kind === "tarifa" && parkingSel ? (
        <Modal title={tarifaModalIntent === "crear" ? "Nueva tarifa" : "Tarifas del proyecto"} onClose={() => { setModal(null); setTarifaModalIntent(null); }}>
          <ParkingRatesManager key={parkingSel.id} parking={{ code: parkingSel.code, name: parkingSel.name }} onRatesChange={alCambiarTarifas} openSignal={tarifaRatesOpenSignal} />
        </Modal>
      ) : null}
    </AppShell>
  );
}
