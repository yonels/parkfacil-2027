"use client";
// Revisión/Activación de un Proyecto On Street (cierre integral del flujo,
// 2026-08-30). Componente ÚNICO reutilizado por la etapa "Revisión" del
// constructor "Nuevo proyecto" (OnStreetProjectWizard.js) y por el tab
// "Resumen" de la ficha (OnStreetProjectDetail.js) -- no hay dos
// implementaciones del resumen ni de la activación. Reutiliza el motor de
// activación YA EXISTENTE (POST /api/estacionamientos/[id]/activar, con su
// propia validación real vía parkingConfigurator.mjs) -- no se crea un
// segundo motor ni se inventa un estado nuevo.
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";

const STATE_LABEL = { DRAFT: "Borrador", CONFIGURING: "En configuración", READY_FOR_REVIEW: "Listo para revisión", ACTIVE: "Activo", INACTIVE: "Inactivo", SUSPENDED: "Suspendido", CLOSED: "Cerrado" };

export default function OnStreetProjectActivation({ data, onActivated }) {
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");

  async function activarProyecto() {
    setActivating(true); setActivateError("");
    try {
      const response = await authenticatedFetch(`/api/estacionamientos/${data.id}/activar`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible activar el proyecto.");
      if (onActivated) await onActivated();
    } catch (cause) {
      setActivateError(cause.message);
    } finally {
      setActivating(false);
    }
  }

  return (
    <section className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Campo label="Proyecto" valor={data.name} />
        <Campo label="Empresa" valor={data.companyName} />
        <Campo label="Estado" valor={STATE_LABEL[data.status] || data.status} />
        <Campo label="Estacionamiento" valor={data.code || data.name} />
        <Campo label="Áreas" valor={String(data.areaCount ?? 0)} />
        <Campo label="Calles" valor={String(data.streetCount ?? 0)} />
        <Campo label="Tramos" valor={String(data.segmentCount ?? 0)} />
        <Campo label="Tarifas disponibles" valor={String(data.rateCount ?? 0)} />
        <Campo label="Ubicaciones QR" valor={String(data.qrCount ?? 0)} />
      </dl>

      {data.status !== "ACTIVE" ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--pf-color-onstreet-border)] bg-[var(--pf-color-onstreet-tint)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black text-[#041E42]">Revisión / Activación</p>
              <p className="mt-1 text-sm text-slate-600">Este proyecto todavía está &ldquo;{STATE_LABEL[data.status] || data.status}&rdquo;. Actívalo cuando su Estructura y al menos una Tarifa estén listas.</p>
            </div>
            <button type="button" disabled={activating} onClick={activarProyecto} className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-5 py-2.5 text-sm font-black text-white disabled:opacity-60">
              <ShieldCheck className="h-4 w-4" />{activating ? "Activando…" : "ACTIVAR PROYECTO"}
            </button>
          </div>
          {activateError ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{activateError}</p> : null}
        </div>
      ) : (
        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />Proyecto activo</p>
      )}
    </section>
  );
}

function Campo({ label, valor }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{valor}</dd>
    </div>
  );
}
