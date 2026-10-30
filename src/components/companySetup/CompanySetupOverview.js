"use client";
// «Configurar empresa» (SOL-2026-10-29-014, fase 1): diagnóstico de solo
// lectura de los 7 pasos de cada cuenta. En un panel lateral plegable, el árbol Empresa →
// Estacionamientos; a la derecha los pasos del estacionamiento elegido, con
// enlace a la pantalla actual de cada paso. No crea ni modifica nada.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeDollarSign, BookOpen, Building2, CheckCircle2, ChevronRight, Clock3, Lock, MapPin, PanelLeftClose, PanelLeftOpen, ParkingSquare, RefreshCw, Search, Users, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { STEP_COLORS, STEP_GUIDES } from "@/lib/companySetup/companySetupGuide.mjs";

const STEP_ICONS = { empresa: Building2, estacionamiento: MapPin, usuarios: Users, tarifas: BadgeDollarSign, zonas: ParkingSquare, activacion: CheckCircle2, turnos: Clock3 };
const LOGO_COLORS = ["#3150D8", "#0891B2", "#7C3AED", "#EA580C", "#DB2777", "#0F766E", "#0284C7"];
const tint = (hex, alpha) => `${hex}${alpha}`;

function StateChip({ state, active }) {
  if (state === "ok") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">✓ Completo</span>;
  if (state === "lock") return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500"><Lock className="h-3 w-3" /> Bloqueado</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">! {active ? "Falta" : "Pendiente"}</span>;
}

function StatusPill({ parking }) {
  const tone = parking.active ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{parking.statusLabel}</span>;
}

function StepDots({ steps }) {
  return (
    <span className="mt-1.5 flex gap-1" aria-hidden="true">
      {steps.map((step) => (
        <i key={step.key} title={`${step.n} · ${step.question}`} className={`grid h-4 w-4 place-items-center rounded-[5px] text-[9px] font-extrabold not-italic text-white ${step.state === "ok" ? "bg-emerald-600" : step.state === "warn" ? "bg-amber-500" : "bg-slate-300"}`}>
          {step.state === "ok" ? "✓" : step.state === "warn" ? "!" : ""}
        </i>
      ))}
    </span>
  );
}

function GuideDrawer({ step, onClose }) {
  if (!step) return null;
  const guide = STEP_GUIDES[step.key];
  const color = STEP_COLORS[step.key];
  const Icon = STEP_ICONS[step.key];
  const blocks = [
    ["🎯 Para qué sirve", "border-indigo-200 bg-indigo-50", <p key="p">{guide.para}</p>],
    ["🧰 Ten a mano", "border-cyan-200 bg-cyan-50", <ul key="u" className="list-disc space-y-1 pl-5">{guide.tener.map((item) => <li key={item}>{item}</li>)}</ul>],
    ["⚠️ Cuidado con", "border-orange-200 bg-orange-50", <ul key="u" className="list-disc space-y-1 pl-5">{guide.cuidado.map((item) => <li key={item}>{item}</li>)}</ul>],
    ["🏁 Sabrás que terminaste cuando", "border-emerald-200 bg-emerald-50", <p key="p">{guide.fin}</p>],
  ];
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Guía del paso ${step.n}`}>
      <button type="button" aria-label="Cerrar guía" onClick={onClose} className="absolute inset-0 bg-[#041E42]/35 backdrop-blur-[2px]" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center gap-4 p-5 text-white" style={{ background: `linear-gradient(135deg, ${color}, #041E42)` }}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20"><Icon className="h-6 w-6" /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-85">Paso {step.n} de 7 · {step.name}</p>
            <h3 className="text-xl font-bold">{step.question}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-white/20"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 overflow-auto p-5 text-sm text-slate-700">
          {blocks.map(([title, tone, body]) => (
            <section key={title} className={`rounded-2xl border p-4 ${tone}`}>
              <h4 className="mb-1.5 font-bold text-[#041E42]">{title}</h4>
              {body}
            </section>
          ))}
        </div>
        <div className="mt-auto border-t border-slate-200 p-4 text-right">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-sm font-bold text-white" style={{ background: color }}>Entendido</button>
        </div>
      </aside>
    </div>
  );
}

export default function CompanySetupOverview() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [selected, setSelected] = useState(null); // { companyId, index }
  const [guideStep, setGuideStep] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/administracion/configurar-empresa", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el estado de configuración de las empresas.");
      const data = body.data || [];
      setCompanies(data);
      setSelected((current) => current && data.some((company) => company.id === current.companyId) ? current : data[0] ? { companyId: data[0].id, index: 0 } : null);
      setOpen((current) => current.size || !data[0] ? current : new Set([data[0].id]));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) => company.name.toLowerCase().includes(term) || company.tradeName.toLowerCase().includes(term) || company.rut.replace(/\./g, "").includes(term.replace(/\./g, "")));
  }, [companies, filter]);

  const pendingCompanies = companies.filter((company) => company.hasPending).length;
  const company = companies.find((item) => item.id === selected?.companyId) || null;
  const parking = company?.parkings[selected?.index ?? 0] || null;
  const doneRatio = parking ? Math.round((parking.doneCount / 7) * 100) : 0;

  function toggle(companyId) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(companyId)) next.delete(companyId); else next.add(companyId);
      return next;
    });
    setSelected({ companyId, index: 0 });
  }

  return (
    <AppShell title="Configurar empresa" description="Siete pasos, siete preguntas: qué tiene completo cada cuenta y qué le falta (solo lectura).">
      {error ? <p role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p> : null}
      <div className="flex flex-col items-start gap-5 lg:flex-row">
        {/* Panel lateral propio de la pantalla: árbol Empresa → Estacionamientos, plegable. */}
        <aside className={`w-full shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4 ${panelOpen ? "lg:w-[280px]" : "lg:w-14"}`}>
          {panelOpen ? (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-fuchsia-50 px-3 py-2.5">
                <Building2 className="h-4 w-4 text-[#3150D8]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#041E42]">Empresas</p>
                  <p className="truncate text-[11px] text-slate-600">{loading ? "Cargando…" : `${pendingCompanies} de ${companies.length} con pasos pendientes`}</p>
                </div>
                <button type="button" onClick={() => void load()} disabled={loading} title="Actualizar" aria-label="Actualizar" className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-white disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></button>
                <button type="button" onClick={() => setPanelOpen(false)} title="Plegar panel" aria-label="Plegar panel de empresas" className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-white"><PanelLeftClose className="h-4 w-4" /></button>
              </div>
              <div className="p-2">
                <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-300 px-2.5 py-1.5 focus-within:border-[#3150D8]">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar empresa o RUT…" className="w-full bg-transparent text-[13px] outline-none" />
                </label>
                <div className="max-h-[60vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-11rem)]">
                  {!loading && !visible.length ? <p className="p-4 text-center text-sm text-slate-500">No hay empresas que coincidan.</p> : null}
                  {visible.map((item, companyIndex) => {
                    const isOpen = open.has(item.id);
                    return (
                      <div key={item.id}>
                        <button type="button" onClick={() => toggle(item.id)} aria-expanded={isOpen} title={item.name} className={`flex w-full items-center gap-2 rounded-xl px-1.5 py-1.5 text-left hover:bg-slate-50 ${selected?.companyId === item.id ? "bg-slate-50" : ""}`}>
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${isOpen ? "rotate-90" : ""}`} />
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold text-white" style={{ background: LOGO_COLORS[companyIndex % LOGO_COLORS.length] }}>{item.name.slice(0, 2).toUpperCase()}</span>
                          <span className="min-w-0 flex-1 leading-tight">
                            <b className="block truncate text-[13px] text-[#041E42]">{item.name}</b>
                            <small className="block truncate text-[11px] text-slate-500">{item.rut || "Sin RUT"}</small>
                          </span>
                          {item.hasPending ? <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-800">! {item.pendingCount}</span> : <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-extrabold text-emerald-800">✓</span>}
                        </button>
                        {isOpen ? item.parkings.map((entry, index) => {
                          const isSelected = selected?.companyId === item.id && selected?.index === index;
                          return (
                            <button key={entry.id || "sin-estacionamiento"} type="button" onClick={() => setSelected({ companyId: item.id, index })} title={entry.name} className={`ml-6 block w-[calc(100%-1.5rem)] rounded-r-xl border-l-2 px-2.5 py-1.5 text-left ${isSelected ? "border-[#3150D8] bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}>
                              <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-800"><span className="min-w-0 truncate">{entry.name}</span><StatusPill parking={entry} /></span>
                              <StepDots steps={entry.steps} />
                            </button>
                          );
                        }) : null}
                        {isOpen && item.otherParkings.length ? (
                          <p className="ml-6 px-2.5 py-1 text-[11px] text-slate-500">On Street ({item.otherParkings.length}): se configura con la activación On Street.</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setPanelOpen(true)} title="Mostrar empresas" aria-label="Mostrar panel de empresas" className="flex w-full items-center justify-center gap-2 py-3 text-sm font-bold text-[#3150D8] hover:bg-slate-50 lg:flex-col lg:py-4">
              <PanelLeftOpen className="h-4 w-4" />
              <span className="lg:[writing-mode:vertical-rl]">Empresas{pendingCompanies ? ` · ! ${pendingCompanies}` : ""}</span>
            </button>
          )}
        </aside>

        <div className="w-full min-w-0 flex-1">
          {company && parking ? (
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-pink-50 to-cyan-50 px-6 py-5">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#16A34A ${doneRatio}%, #E2E8F0 0)` }}>
                  <b className="grid h-12 w-12 place-items-center rounded-full bg-white text-sm text-[#041E42]">{parking.doneCount}/7</b>
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-[#041E42]">{company.name}</h2>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">{parking.name}{parking.code ? ` · ${parking.code}` : ""} <StatusPill parking={parking} /></p>
                </div>
              </div>
              {parking.active && parking.pendingCount ? (
                <p className="mx-6 mt-5 rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-900">📡 Este estacionamiento <b>está operando</b>. Lo pendiente se muestra como aviso: <b>no se bloquea nada</b> y el POS sigue funcionando.</p>
              ) : null}
              {!parking.active ? (
                <p className="mx-6 mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">🧭 Configuración en curso. Los pasos se completan <b>en orden</b>; los bloqueados se habilitan al completar el pendiente anterior.</p>
              ) : null}
              <ol className="grid gap-2.5 p-6">
                {parking.steps.map((step) => {
                  const Icon = STEP_ICONS[step.key];
                  const color = STEP_COLORS[step.key];
                  const tone = step.state === "warn" ? "border-amber-300 bg-gradient-to-r from-amber-50 to-white" : step.state === "lock" ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white";
                  return (
                    <li key={step.key} className={`grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 2xl:grid-cols-[auto_1fr_auto] ${tone}`}>
                      <span className={`grid h-11 w-11 place-items-center rounded-2xl border-2 ${step.state === "lock" ? "opacity-45 grayscale" : ""}`} style={{ background: tint(color, "1A"), borderColor: tint(color, "55"), color }}><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <p className="font-extrabold text-[#041E42]">{step.n} · {step.question} <small className="ml-1 font-semibold text-slate-500">{step.name}</small></p>
                        {step.detail ? <p className="text-[13px] text-slate-600">{step.detail}</p> : null}
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-2 pl-14 2xl:col-span-1 2xl:justify-end 2xl:pl-0">
                        <StateChip state={step.state} active={parking.active} />
                        {step.state !== "lock" && step.href ? (
                          step.state === "ok"
                            ? <Link href={step.href} className="text-xs font-semibold text-[#3150D8] hover:underline">Ver o editar</Link>
                            : <Link href={step.href} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-sm" style={{ background: color }}>Completar →</Link>
                        ) : null}
                        <button type="button" onClick={() => setGuideStep(step)} title="Guía del paso" aria-label={`Guía del paso ${step.n}`} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><BookOpen className="h-4 w-4" /></button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">Vista de solo lectura. «Completar» y «Ver o editar» abren la pantalla actual de cada paso.</p>
            </div>
          ) : !loading && !error ? (
            <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Elige una empresa para ver sus pasos.</p>
          ) : null}
        </div>
      </div>
      <GuideDrawer step={guideStep} onClose={() => setGuideStep(null)} />
    </AppShell>
  );
}
