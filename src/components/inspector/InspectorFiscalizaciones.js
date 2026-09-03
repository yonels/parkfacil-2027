"use client";
import { ClipboardPlus } from "lucide-react";
import { relativeTimeFromNow } from "@/lib/inspector/inspectorTime.mjs";

// Pestaña "Fiscalizaciones" de la navegación (Etapa 1, sección 11): lista lo
// registrado en esta sesión (simulado, ver InspectorFiscalizacion.js) y
// permite iniciar una nueva sin necesidad de pasar antes por una consulta.
// onOpen (2026-09-03, "abrir detalle desde la lista"): cada tarjeta ahora es
// tocable -- antes no tenía ningún onClick/Link, así que tocarla no hacía
// nada (bug reportado: "toca QA9001 y no abre el detalle"). Reabrir NUNCA
// vuelve a fiscalizar ni a enviar SMS -- ver getInspectorInspectionById
// (solo lectura) y el uso de onOpen en InspectorApp.js.
export default function InspectorFiscalizaciones({ fiscalizaciones, onNueva, onOpen }) {
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
        <h2 className="text-sm font-black uppercase tracking-wide text-slate-500">Registradas en esta sesión</h2>
        {fiscalizaciones.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">Aún no registras fiscalizaciones en esta sesión.</p>
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
