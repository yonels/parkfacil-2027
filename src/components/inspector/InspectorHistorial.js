"use client";
import { useMemo, useState } from "react";
import { relativeTimeFromNow } from "@/lib/inspector/inspectorTime.mjs";
import { buildInspectorHistory } from "./inspectorHistory.mjs";
import InspectorStatusBadge from "./InspectorStatusBadge";

const TABS = Object.freeze(["Todas", "Fiscalizaciones", "Consultas"]);

export default function InspectorHistorial({ history, fiscalizaciones }) {
  const [tab, setTab] = useState(TABS[0]);
  const combined = useMemo(() => buildInspectorHistory(history, fiscalizaciones), [history, fiscalizaciones]);
  const visible = tab === "Todas" ? combined : combined.filter((e) => e.tipo === (tab === "Fiscalizaciones" ? "Fiscalización" : "Consulta"));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <h1 className="text-2xl font-black text-[#041E42]">Historial</h1>

      <div role="tablist" aria-label="Filtrar historial" className="mt-4 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold ${tab === t ? "bg-[#3150D8] text-white" : "bg-white text-slate-600"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">Sin eventos en esta categoría todavía.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-black tracking-wide text-[#041E42]">{e.plate}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{e.tipo}{e.motivo ? ` · ${e.motivo}` : ""}</p>
              </div>
              <div className="shrink-0 text-right">
                {e.status ? <InspectorStatusBadge status={e.status} /> : null}
                <p className="mt-1 text-xs font-semibold text-slate-500">{relativeTimeFromNow(e.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
