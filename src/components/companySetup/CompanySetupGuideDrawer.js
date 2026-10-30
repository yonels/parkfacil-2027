"use client";
// Guía lateral de un paso de «Configurar empresa» (SOL-2026-10-29-014): los
// mismos 4 bloques en los 7 pasos para que se aprenda una sola vez.
import { X } from "lucide-react";
import { STEP_COLORS, STEP_GUIDES } from "@/lib/companySetup/companySetupGuide.mjs";
import { STEP_ICONS } from "./companySetupIcons";

export default function CompanySetupGuideDrawer({ step, onClose }) {
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
