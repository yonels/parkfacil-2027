"use client";
// Asistente «Nueva empresa» de «Configurar empresa» (SOL-2026-10-29-014, F2).
// Siete pasos, una pregunta por paso, en orden. Pasos 1–3: borrador en el
// navegador que se crea de una vez con POST /api/empresas al terminar el paso
// 3 (igual que «Crear empresa»). Pasos 4–7: el asistente explica el paso y
// abre la pantalla actual; al volver, el estado sale de los datos reales.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Lock, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import { SETUP_STEPS } from "@/lib/companySetup/companySetupCore.mjs";
import { STEP_COLORS, STEP_GUIDES } from "@/lib/companySetup/companySetupGuide.mjs";
import { buildCompanyCreatePayload, canOpenWizardStep, currentWizardStep, defaultParkingCode, emptyWizardDraft, validateDraftStep } from "@/lib/companySetup/companySetupWizardCore.mjs";
import CompanySetupGuideDrawer from "./CompanySetupGuideDrawer";
import { STEP_ICONS } from "./companySetupIcons";

const DRAFT_KEY = "pf-configurar-empresa-borrador-v1";
const tint = (hex, alpha) => `${hex}${alpha}`;

function readDraft() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null");
    return stored ? { ...emptyWizardDraft(), ...stored } : null;
  } catch {
    return null;
  }
}
function writeDraft(draft) {
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* el borrador solo vive en memoria */ }
}
function clearDraft() {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* sin almacenamiento disponible */ }
}

function Field({ id, label, value, onChange, error, help, placeholder, optional = false, readOnly = false, type = "text" }) {
  return (
    <label htmlFor={`wz-${id}`} className="block">
      <span className="mb-1 block text-[12.5px] font-bold text-slate-700">{label}{optional ? <span className="font-medium text-slate-500"> (opcional)</span> : null}</span>
      <input id={`wz-${id}`} type={type} value={value} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder}
        className={`w-full rounded-xl border-[1.5px] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--step)] focus:ring-4 focus:ring-[var(--step-ring)] ${error ? "border-rose-500 bg-rose-50" : readOnly ? "border-dashed border-slate-300 bg-slate-50 text-slate-600" : "border-slate-300 bg-white"}`} />
      {error ? <span className="mt-1 block text-xs font-semibold text-rose-600">⚠ {error}</span> : help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

function Block({ icon, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-extrabold text-[#041E42]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--step-soft)] text-sm">{icon}</span>{title}</h3>
      {children}
    </section>
  );
}

// existingCompanyId: continuar una cuenta ya creada (sin borrador).
export default function CompanySetupWizard({ companies, onReload, onExit, existingCompanyId = null }) {
  const [draft, setDraft] = useState(() => {
    if (existingCompanyId) return { ...emptyWizardDraft(), done: { 1: true, 2: true, 3: true }, createdCompanyId: existingCompanyId };
    return emptyWizardDraft();
  });
  const [view, setView] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [guideStep, setGuideStep] = useState(null);
  const [resumed, setResumed] = useState(false);

  // El borrador se lee después de montar (localStorage no existe en el servidor).
  useEffect(() => {
    if (existingCompanyId) return;
    const stored = readDraft();
    if (stored) {
      const timer = window.setTimeout(() => { setDraft(stored); setResumed(stored.done[1] || Boolean(stored.createdCompanyId)); }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [existingCompanyId]);

  const update = useCallback((next) => {
    setDraft(next);
    if (!existingCompanyId) writeDraft(next);
  }, [existingCompanyId]);

  const company = draft.createdCompanyId ? companies.find((item) => item.id === draft.createdCompanyId) || null : null;
  const parkingSetup = company?.parkings.find((item) => item.id) || null;
  const current = currentWizardStep(draft, parkingSetup);
  const step = view ?? Math.min(current, 8);
  const existingRuts = useMemo(() => companies.map((item) => item.rut).filter(Boolean), [companies]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await onReload(); } finally { setRefreshing(false); }
  }, [onReload]);

  // Al volver de una pantalla actual (otra pestaña o «Atrás»), se recalcula.
  useEffect(() => {
    if (!draft.createdCompanyId) return undefined;
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [draft.createdCompanyId, refresh]);

  function stateOf(n) {
    if (!draft.createdCompanyId) return draft.done[n] ? "ok" : n === current ? "current" : "lock";
    const real = parkingSetup?.steps.find((item) => item.n === n)?.state;
    if (real === "ok") return "ok";
    if (n === current) return "current";
    return real === "warn" && parkingSetup?.active ? "warn" : "lock";
  }

  function open(n) {
    if (!canOpenWizardStep(n, draft, parkingSetup)) return;
    setErrors({}); setCreateError(""); setView(n); setResumed(false);
  }

  function setField(section, field, value) {
    update({ ...draft, [section]: { ...draft[section], [field]: value } });
    if (errors[field]) setErrors((currentErrors) => { const next = { ...currentErrors }; delete next[field]; return next; });
  }

  async function saveDraftStep() {
    const found = validateDraftStep(step, draft, existingRuts);
    setErrors(found);
    if (Object.keys(found).length) return;
    const next = { ...draft, done: { ...draft.done, [step]: true } };
    if (step === 1 && !draft.done[1]) {
      // El estacionamiento parte con la dirección de la empresa.
      next.parking = { ...next.parking, address: next.parking.address || draft.company.address, district: next.parking.district || draft.company.district, city: next.parking.city || draft.company.city };
    }
    update(next);
    setView(currentWizardStep(next) === step ? step : currentWizardStep(next));
  }

  async function createCompany() {
    const found = { ...validateDraftStep(1, draft, existingRuts), ...validateDraftStep(2, draft), ...validateDraftStep(3, draft) };
    setErrors(found);
    if (Object.keys(found).length) { setCreateError("Revisa los pasos marcados: hay datos pendientes."); return; }
    setSaving(true); setCreateError("");
    try {
      const response = await authenticatedFetch("/api/empresas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildCompanyCreatePayload(draft)) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCreateError([body.error || "No fue posible crear la empresa.", ...(Array.isArray(body.details) ? body.details : [])].join(" "));
        return;
      }
      const next = { ...draft, done: { 1: true, 2: true, 3: true }, createdCompanyId: body.data?.id || null, createdAccounts: body.accounts || [], enrollment: body.enrollment || null };
      update(next);
      setView(null);
      await onReload();
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!window.confirm("¿Descartar el borrador? Se borra lo escrito en este navegador.")) return;
    clearDraft();
    setDraft(emptyWizardDraft()); setView(null); setErrors({}); setResumed(false);
  }

  // La empresa creada sigue en «Cuentas existentes»; el asistente vuelve a cero.
  function startAnother() {
    clearDraft();
    setDraft(emptyWizardDraft()); setView(null); setErrors({}); setResumed(false); setCreateError("");
  }

  function finishAndExit() {
    const companyId = draft.createdCompanyId;
    if (!existingCompanyId) clearDraft();
    onExit(companyId);
  }

  const meta = step <= 7 ? SETUP_STEPS[step - 1] : null;
  const color = meta ? STEP_COLORS[meta.key] : "#0F766E";
  const doneCount = SETUP_STEPS.filter((item) => stateOf(item.n) === "ok").length;
  const styleVars = { "--step": color, "--step-soft": tint(color, "1F"), "--step-ring": tint(color, "26") };

  return (
    <div className="space-y-4" style={styleVars}>
      {resumed && current <= 7 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-pink-50 px-4 py-3 text-sm">
          <span>👋 Continúa donde quedaste: <b className="text-[#041E42]">{current} · {SETUP_STEPS[current - 1].question}</b></span>
          <button type="button" onClick={() => open(current)} className="rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: STEP_COLORS[SETUP_STEPS[current - 1].key] }}>Ir al paso {current}</button>
          <button type="button" onClick={() => setResumed(false)} className="text-xs font-semibold text-[#3150D8]">Cerrar</button>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-extrabold text-[#041E42]">{meta ? `Paso ${step} de 7 · ${meta.question}` : "¡Listo para operar! 🎉"}{meta ? <span className="ml-2 text-sm font-semibold text-slate-500">{meta.name}</span> : null}</p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">{draft.createdCompanyId ? `${company?.name || "Empresa creada"} · ${doneCount}/7 completos` : "Borrador guardado en este navegador"}</span>
            {draft.createdCompanyId ? <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Actualizar estado</button> : null}
            {!draft.createdCompanyId && draft.done[1] ? <button type="button" onClick={discard} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5" />Descartar borrador</button> : null}
            {draft.createdCompanyId && !existingCompanyId ? <button type="button" onClick={startAnother} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"><Plus className="h-3.5 w-3.5" />Empezar otra empresa</button> : null}
            <button type="button" onClick={finishAndExit} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"><LogOut className="h-3.5 w-3.5" />Salir del asistente</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5" aria-hidden="true">
          {SETUP_STEPS.map((item) => {
            const state = stateOf(item.n);
            const background = state === "ok" ? STEP_COLORS[item.key] : state === "warn" ? "repeating-linear-gradient(45deg,#F59E0B 0 6px,#FCD34D 6px 12px)" : state === "current" ? `linear-gradient(90deg, ${STEP_COLORS[item.key]} 0 35%, #E2E8F0 35%)` : "#E2E8F0";
            return <span key={item.key} title={`${item.n} · ${item.question}`} className="h-2.5 rounded-full" style={{ background }} />;
          })}
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[250px_1fr]">
        <nav aria-label="Pasos del asistente" className="flex gap-1 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2 shadow-sm xl:flex-col xl:overflow-visible">
          {SETUP_STEPS.map((item) => {
            const state = stateOf(item.n);
            const Icon = STEP_ICONS[item.key];
            const locked = !canOpenWizardStep(item.n, draft, parkingSetup);
            const itemColor = STEP_COLORS[item.key];
            return (
              <button key={item.key} type="button" disabled={locked} onClick={() => open(item.n)} title={locked ? `Se habilita al completar el paso ${current}` : item.name}
                className={`flex shrink-0 items-center gap-3 rounded-2xl p-2 text-left transition disabled:cursor-not-allowed xl:w-full ${step === item.n ? "ring-[1.5px]" : "hover:bg-slate-50"}`}
                style={step === item.n ? { background: tint(itemColor, "14"), "--tw-ring-color": tint(itemColor, "80") } : undefined}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 ${locked ? "opacity-40 grayscale" : ""}`} style={{ background: tint(itemColor, "1F"), borderColor: tint(itemColor, "55"), color: itemColor }}><Icon className="h-5 w-5" /></span>
                <span className={`hidden min-w-0 flex-1 xl:block ${step === item.n ? "!block" : ""}`}>
                  <span className="block text-[10px] font-extrabold tracking-[0.08em]" style={{ color: locked ? "#94A3B8" : itemColor }}>PASO {item.n}</span>
                  <span className={`block text-[13.5px] font-extrabold ${locked ? "text-slate-400" : "text-[#041E42]"}`}>{item.question}</span>
                  <span className="block text-[11.5px] text-slate-500">{item.name}</span>
                </span>
                {state === "ok" ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : state === "warn" ? <span className="shrink-0 text-xs font-extrabold text-amber-600">!</span> : locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: itemColor }} />}
              </button>
            );
          })}
        </nav>

        {meta ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-4 border-b px-6 py-5" style={{ background: `linear-gradient(120deg, ${tint(color, "29")}, ${tint(color, "08")} 70%)`, borderColor: tint(color, "33") }}>
              {(() => { const Icon = STEP_ICONS[meta.key]; return <span className="grid h-14 w-14 place-items-center rounded-2xl text-white shadow-lg" style={{ background: color }}><Icon className="h-7 w-7" /></span>; })()}
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color }}>Paso {step} de 7 · {meta.name}</p>
                <h2 className="text-2xl font-bold text-[#041E42]">{meta.question}</h2>
              </div>
              <button type="button" onClick={() => setGuideStep(meta)} className="ml-auto inline-flex items-center gap-2 rounded-full border-[1.5px] bg-white px-4 py-2 text-sm font-bold" style={{ borderColor: tint(color, "66"), color }}><BookOpen className="h-4 w-4" />Guía de este paso</button>
            </div>

            {draft.createdAccounts && step === 4 && parkingSetup && stateOf(4) !== "ok" ? (
              <div className="mx-6 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-bold">✅ Empresa creada: estacionamiento {parkingSetup.code} en Borrador y 3 cuentas.</p>
                <ul className="mt-1 list-disc pl-5">{draft.createdAccounts.map((account) => <li key={account.username}>{account.label}: {account.fullName} · usuario <b>{account.username}</b></li>)}</ul>
                <p className="mt-1">{draft.enrollment?.emailSent ? `Las claves se enviaron a ${draft.company.contactEmail}.` : "El correo con las claves no se pudo enviar: reenvíalo desde la ficha de la empresa («Enrolamiento»)."}</p>
              </div>
            ) : null}

            <div className="grid gap-4 px-6 py-5">
              {!draft.createdCompanyId && step <= 3 ? <DraftStep step={step} draft={draft} errors={errors} setField={setField} /> : <RealStep step={step} meta={meta} color={color} setup={parkingSetup} company={company} state={stateOf(step)} />}
              {createError ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{createError}</p> : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-6 py-4">
              <button type="button" disabled={step === 1} onClick={() => open(step - 1)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">← Anterior</button>
              <span className="flex-1" />
              {!draft.createdCompanyId && step < 3 ? <button type="button" onClick={() => void saveDraftStep()} className="rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md" style={{ background: color }}>Guardar y continuar → {SETUP_STEPS[step].question}</button> : null}
              {!draft.createdCompanyId && step === 3 ? <button type="button" onClick={() => void createCompany()} disabled={saving} className="rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60" style={{ background: color }}>{saving ? "Creando…" : "Crear empresa y continuar →"}</button> : null}
              {draft.createdCompanyId && step < 7 && stateOf(step) === "ok" ? <button type="button" onClick={() => open(Math.min(current, 7))} className="rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md" style={{ background: STEP_COLORS[SETUP_STEPS[Math.min(current, 7) - 1].key] }}>Ir al paso actual → {SETUP_STEPS[Math.min(current, 7) - 1].question}</button> : null}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_20%_10%,#E0E7FF,transparent_40%),radial-gradient(circle_at_85%_30%,#FCE7F3,transparent_40%),radial-gradient(circle_at_50%_100%,#CCFBF1,transparent_50%)] bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-5xl">🎉</p>
            <h2 className="mt-2 text-2xl font-bold text-[#041E42]">¡{parkingSetup?.name || "El estacionamiento"} está listo para operar!</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">Completaste las 7 preguntas. Puedes volver a cualquier paso para revisarlo.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">{SETUP_STEPS.map((item) => <span key={item.key} className="rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: STEP_COLORS[item.key] }}>{item.question} ✓</span>)}</div>
            <button type="button" onClick={finishAndExit} className="mt-6 rounded-full bg-[#3150D8] px-5 py-2.5 text-sm font-bold text-white">Ver en «Cuentas existentes»</button>
          </div>
        )}
      </div>
      <CompanySetupGuideDrawer step={guideStep} onClose={() => setGuideStep(null)} />
    </div>
  );
}

function DraftStep({ step, draft, errors, setField }) {
  const c = draft.company;
  const p = draft.parking;
  const u = draft.users;
  if (step === 1) return (
    <>
      <Block icon="🪪" title="Identificación">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="rut" label="RUT de la empresa" value={c.rut} onChange={(value) => setField("company", "rut", value)} error={errors.rut} placeholder="Ej.: 76.543.210-3" help="Con puntos y guion. Se valida el dígito verificador." />
          <Field id="businessName" label="Razón social" value={c.businessName} onChange={(value) => setField("company", "businessName", value)} error={errors.businessName} placeholder="Ej.: Comercial Los Andes SpA" help="Tal como aparece en el SII." />
          <Field id="tradeName" label="Nombre de fantasía" optional value={c.tradeName} onChange={(value) => setField("company", "tradeName", value)} placeholder="Ej.: Los Andes" help="Si lo dejas vacío se usa la razón social." />
          <Field id="businessActivity" label="Giro" value={c.businessActivity} onChange={(value) => setField("company", "businessActivity", value)} error={errors.businessActivity} placeholder="Ej.: Estacionamiento de vehículos" />
        </div>
      </Block>
      <Block icon="📞" title="Contacto">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="contactEmail" type="email" label="Correo de contacto" value={c.contactEmail} onChange={(value) => setField("company", "contactEmail", value)} error={errors.contactEmail} placeholder="Ej.: contacto@empresa.cl" help="Aquí llegan los usuarios y claves de las 3 cuentas." />
          <Field id="mobilePhone" type="tel" label="Móvil" optional value={c.mobilePhone} onChange={(value) => setField("company", "mobilePhone", value)} error={errors.mobilePhone} placeholder="Ej.: +56 9 1234 5678" />
        </div>
      </Block>
      <Block icon="🏢" title="Dirección de la empresa">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="address" label="Dirección" optional value={c.address} onChange={(value) => setField("company", "address", value)} placeholder="Ej.: Av. Libertad 1850" />
          <Field id="district" label="Comuna" optional value={c.district} onChange={(value) => setField("company", "district", value)} placeholder="Ej.: Viña del Mar" />
          <Field id="city" label="Ciudad" optional value={c.city} onChange={(value) => setField("company", "city", value)} placeholder="Ej.: Viña del Mar" />
        </div>
      </Block>
    </>
  );
  if (step === 2) return (
    <>
      <Field id="company" label="Empresa" value={c.businessName} readOnly help="🔒 Viene del paso 1. Para cambiarla, vuelve a «¿Quién soy?»." />
      <Block icon="🏷️" title="Nombre y código">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="parkingName" label="Nombre del estacionamiento" value={p.name} onChange={(value) => setField("parking", "name", value)} error={errors.name} placeholder="Ej.: Estacionamiento Centro" help="Como lo conocen tus clientes." />
          <Field id="parkingCode" label="Código" value={defaultParkingCode(c.rut) || "Se asigna con el RUT"} readOnly help="Se asigna automáticamente al crear la empresa." />
        </div>
      </Block>
      <Block icon="🧭" title="¿Cómo opera?">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border-2 p-4" style={{ borderColor: "var(--step)", background: "var(--step-soft)" }}><b className="block text-[#041E42]">🅿️ Off Street ✓</b><span className="text-xs text-slate-600">Recinto cerrado: el vehículo entra, se estaciona y paga al salir.</span></div>
          <div className="rounded-2xl border-2 border-slate-200 p-4 opacity-60"><b className="block text-[#041E42]">🛣️ On Street</b><span className="text-xs text-slate-600">En la calle, por tramos. Se configura con la activación On Street.</span></div>
        </div>
      </Block>
      <Block icon="📍" title="Ubicación">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="parkingAddress" label="Dirección" value={p.address} onChange={(value) => setField("parking", "address", value)} error={errors.address} placeholder="Ej.: Av. Libertad 1850" />
          <Field id="parkingDistrict" label="Comuna" optional value={p.district} onChange={(value) => setField("parking", "district", value)} placeholder="Ej.: Viña del Mar" />
          <Field id="parkingCity" label="Ciudad" value={p.city} onChange={(value) => setField("parking", "city", value)} error={errors.city} placeholder="Ej.: Viña del Mar" />
        </div>
      </Block>
    </>
  );
  return (
    <>
      <Block icon="🧑‍💼" title="Administrador">
        <Field id="administrator" label="Nombre completo del administrador" value={u.administrator} onChange={(value) => setField("users", "administrator", value)} error={errors.administrator} placeholder="Ej.: Carlos Rojas" help="Puede ver reportes y crear más operadores." />
      </Block>
      <Block icon="🧑‍🔧" title="Operadores del POS">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="operator1" label="Operador 1" value={u.operator1} onChange={(value) => setField("users", "operator1", value)} error={errors.operator1} placeholder="Ej.: Juan Pérez" />
          <Field id="operator2" label="Operador 2" value={u.operator2} onChange={(value) => setField("users", "operator2", value)} error={errors.operator2} placeholder="Ej.: Ana Soto" />
        </div>
        <p className="mt-3 text-xs text-slate-500">Más operadores se agregan después en Usuarios → Operadores.</p>
      </Block>
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-bold">Al presionar «Crear empresa y continuar» se crea, igual que en «Crear empresa»:</p>
        <ul className="mt-1 list-disc pl-5">
          <li>La empresa {c.businessName ? <b>{c.businessName}</b> : null}.</li>
          <li>El estacionamiento {p.name ? <b>{p.name}</b> : null} ({defaultParkingCode(c.rut) || "código según RUT"}) en Borrador: todavía no aparece en el POS.</li>
          <li>1 administrador y 2 operadores con usuario y clave generados por el sistema.</li>
          <li>Un correo a <b>{c.contactEmail || "el correo de contacto"}</b> con los usuarios y claves.</li>
        </ul>
      </div>
    </>
  );
}

function RealStep({ step, meta, color, setup, company, state }) {
  const real = step <= 3 && company && !setup ? null : setup?.steps.find((item) => item.n === step);
  const guide = STEP_GUIDES[meta.key];
  if (!real) return <p className="text-sm text-slate-600">Cargando el estado de la empresa…</p>;
  const chip = state === "ok" ? "bg-emerald-100 text-emerald-800" : state === "lock" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800";
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3" style={{ borderColor: state === "ok" ? "#BBF7D0" : state === "lock" ? "#E2E8F0" : "#FCD34D", background: state === "ok" ? "#F0FDF4" : state === "lock" ? "#F8FAFC" : "#FFFBEB" }}>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${chip}`}>{state === "ok" ? "✓ Completo" : state === "lock" ? "🔒 Bloqueado" : "! Pendiente"}</span>
        <p className="text-sm text-slate-700">{real.detail}</p>
      </div>
      {state !== "ok" && state !== "lock" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-slate-700"><h3 className="mb-1 font-bold text-[#041E42]">🧰 Ten a mano</h3><ul className="list-disc space-y-0.5 pl-5">{guide.tener.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-700"><h3 className="mb-1 font-bold text-[#041E42]">⚠️ Cuidado con</h3><ul className="list-disc space-y-0.5 pl-5">{guide.cuidado.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
      ) : null}
      {state !== "lock" && real.href ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-4 py-3">
          <p className="flex-1 text-sm text-slate-600">{state === "ok" ? "Puedes revisarlo o cambiarlo en su pantalla." : `Se completa en la pantalla de ${meta.name}. Al volver aquí, el asistente detecta el avance.`}</p>
          <Link href={real.href} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold text-white shadow-md" style={{ background: color }}>{state === "ok" ? "Ver o editar" : `Abrir ${meta.name}`} →</Link>
        </div>
      ) : null}
    </>
  );
}
