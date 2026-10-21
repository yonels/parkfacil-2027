"use client";
import { ClipboardPlus } from "lucide-react";
import { relativeTimeFromNow } from "@/lib/inspector/inspectorTime.mjs";

// Pestaña "Fiscalizaciones" de la navegación (Etapa 1, sección 11): lista
// las fiscalizaciones reales del inspector autenticado (GET
// /api/inspector/inspections, ver InspectorApp.js) y permite iniciar una
// nueva sin necesidad de pasar antes por una consulta.
// onOpen (2026-09-03, "abrir detalle desde la lista"): cada tarjeta ahora es
// tocable -- antes no tenía ningún onClick/Link, así que tocarla no hacía
// nada (bug reportado: "toca QA9001 y no abre el detalle"). Reabrir NUNCA
// vuelve a fiscalizar ni a enviar SMS -- ver getInspectorInspectionById
// (solo lectura) y el uso de onOpen en InspectorApp.js.
//
// status (incidente CXPY93, 2026-09-03): "idle" | "loading" | "success" |
// "error" -- reportado por InspectorApp.js (loadFiscalizaciones). Antes un
// fetch fallido devolvía [] y esta pantalla lo mostraba idéntico a "no
// tienes fiscalizaciones", así que una fiscalización real (CXPY93, SMS
// enviado, ticket impreso) parecía no existir. Ahora la lista vacía SOLO se
// muestra cuando status==="success" && fiscalizaciones.length===0 -- nunca
// como sustituto silencioso de un error.
export default function InspectorFiscalizaciones({ fiscalizaciones, status = "success", onRetry, onNueva, onOpen }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-[#041E42]">Fiscalizaciones</h1>
      </div>

      <button onClick={onNueva} className="mt-4 flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[#3150D8] text-lg font-black text-white">
        <ClipboardPlus className="h-5 w-5" aria-hidden="true" />
        NUEVA FISCALIZACIÓN
      </button>

      <section className="mt-6">
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Tus fiscalizaciones</h2>
        {status === "loading" || status === "idle" ? (
          <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">Cargando fiscalizaciones…</p>
        ) : status === "error" ? (
          <div role="alert" className="mt-3 rounded-2xl bg-rose-50 p-4 text-left">
            <p className="text-sm font-semibold text-rose-700">No fue posible cargar las fiscalizaciones.</p>
            <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-700">
              Reintentar
            </button>
          </div>
        ) : fiscalizaciones.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">Aún no hay fiscalizaciones.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {fiscalizaciones.map((f, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onOpen?.(f)}
                  className="w-full rounded-2xl bg-white p-4 text-left shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-black tracking-wide text-[#041E42]">{f.plate}</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">{relativeTimeFromNow(f.at)}</span>
                  </div>
                  <p className="mt-1 break-words text-sm text-slate-600">{f.motivo}{f.observaciones ? ` · ${f.observaciones}` : ""}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
