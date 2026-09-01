"use client";
// Proyectos On Street — Proyectos actuales (corrección definitiva
// 2026-08-30): un Proyecto = un Estacionamiento On Street accesible por el
// usuario, en CUALQUIER estado real (DRAFT/CONFIGURING/READY_FOR_REVIEW/
// ACTIVE/INACTIVE/SUSPENDED/CLOSED) -- por defecto SIN filtrar. Antes solo
// mostraba status='ACTIVE', lo que ocultaba todo Proyecto recién creado
// (nace DRAFT) justo cuando su Estructura/Tarifas/QR/Revisión se completan
// desde su propia ficha. Reutiliza ParkFacilDataGrid (búsqueda/orden/
// resize/reorder/mostrar-ocultar/persistencia), mismo patrón que el resto
// de listados On Street.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import ParkFacilDataGrid from "@/components/ui/ParkFacilDataGrid";
import StatusBadge from "@/components/ui/StatusBadge";
import { ESTACIONAMIENTO_STATES, STATE_LABELS } from "@/lib/estacionamientos.mjs";

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);

const columns = [
  { key: "name", label: "Proyecto" },
  { key: "companyName", label: "Empresa" },
  { key: "code", label: "Estacionamiento" },
  { key: "estructura", label: "Estructura", getValue: (r) => `${r.areaCount} áreas · ${r.streetCount} calles · ${r.segmentCount} tramos` },
  { key: "status", label: "Estado", render: (v) => STATE_LABELS[v] || v },
  { key: "sessionsToday", label: "Sesiones hoy" },
  { key: "activeVehicles", label: "Vehículos estacionados" },
  { key: "revenueToday", label: "Recaudación hoy", render: money },
];

// Variantes de STATUS_BADGE para el ciclo de vida completo del Proyecto/
// Estacionamiento (2026-09-01, tarjetas móviles) -- distinto del mapeo de
// EstadoEstacionamientoBadge.js, que solo cubre ACTIVE/INACTIVE/MAINTENANCE
// (estados de Área, no de Proyecto). No se reutiliza ese componente aquí
// porque perdería la distinción visual entre DRAFT/CONFIGURING/READY_FOR_
// REVIEW/SUSPENDED/CLOSED, mostrando "neutral" para casi todos.
const PROJECT_STATUS_VARIANTS = {
  DRAFT: "neutral",
  CONFIGURING: "neutral",
  READY_FOR_REVIEW: "warning",
  ACTIVE: "positive",
  INACTIVE: "neutral",
  SUSPENDED: "error",
  CLOSED: "error",
};

// Tarjeta móvil de Proyecto (Fase 2, "cards móviles reutilizables"): usa
// EXACTAMENTE los mismos datos que ya alimentan `columns` arriba -- ningún
// dato inventado ni duplicado. Toda la tarjeta es un <Link> (accesible por
// teclado/lector de pantalla de forma nativa, sin reimplementar semántica
// de botón) hacia la misma ficha que abre el doble clic de la fila en
// escritorio.
function ProjectCard({ row }) {
  return (
    <Link
      href={`/on-street-qr/proyectos/${row.id}`}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#3150D8] hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Proyecto</p>
          <p className="truncate text-base font-black text-[#041E42]">{row.name}</p>
        </div>
        <StatusBadge variant={PROJECT_STATUS_VARIANTS[row.status] || "neutral"} uppercase={false}>
          {STATE_LABELS[row.status] || row.status}
        </StatusBadge>
      </div>

      <dl className="mt-3 space-y-2 text-sm text-slate-600">
        <div className="flex items-baseline gap-1">
          <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Empresa</dt>
          <dd className="truncate">{row.companyName || "—"}</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Estacionamiento</dt>
          <dd className="truncate">{row.code || "—"}</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Estructura</dt>
          <dd>{row.areaCount} áreas · {row.streetCount} calles · {row.segmentCount} tramos</dd>
        </div>
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F5F9FF] p-3 text-center">
        <div>
          <p className="text-lg font-black text-[#041E42]">{row.sessionsToday ?? 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sesiones hoy</p>
        </div>
        <div>
          <p className="text-lg font-black text-[#041E42]">{row.activeVehicles ?? 0}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vehículos estacionados</p>
        </div>
      </div>

      <p className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[#3150D8]">
        Ver proyecto <ArrowRight className="h-3.5 w-3.5" />
      </p>
    </Link>
  );
}

export default function OnStreetProjectsList() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  // "" = Todos los estados (por defecto -- ver corrección 2026-08-30, NUNCA
  // 'ACTIVE' por defecto).
  const [statusFilter, setStatusFilter] = useState("");
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await authenticatedFetch("/api/on-street-qr/companies", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (active && response.ok) setCompanies(body.data || []);
      } catch { /* selector Empresa simplemente no aparece */ }
    })();
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (statusFilter) params.set("status", statusFilter);
      const response = await authenticatedFetch(`/api/on-street-qr/proyectos?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar los proyectos.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-[var(--pf-color-onstreet-border)] bg-gradient-to-br from-[var(--pf-color-onstreet-primary-700)] to-[var(--pf-color-onstreet-primary-800)] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black">Proyectos On Street</h1>
            <p className="mt-1 text-sm text-white/85">Proyectos On Street — cada uno representa una implementación de estacionamiento regulado en vía pública.</p>
          </div>
          <Link href="/on-street-qr/proyectos/nuevo" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-[var(--pf-color-onstreet-primary-700)]"><Plus className="h-4 w-4" />Nuevo proyecto</Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-4">
        {companies.length > 1 ? (
          <label className="block max-w-xs text-xs font-semibold text-slate-600">
            Empresa
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">Todas</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block max-w-xs text-xs font-semibold text-slate-600">
          Estado
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Todos</option>
            {ESTACIONAMIENTO_STATES.map((state) => <option key={state} value={state}>{STATE_LABELS[state]}</option>)}
          </select>
        </label>
      </div>

      {error ? <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">Cargando…</div>
        ) : (
          <ParkFacilDataGrid
            storageKey="on-street:proyectos"
            columns={columns}
            rows={data?.rows || []}
            onRowDoubleClick={(row) => router.push(`/on-street-qr/proyectos/${row.id}`)}
            renderMobileCard={(row) => <ProjectCard row={row} />}
            emptyMessage="No hay proyectos para el filtro seleccionado."
            exportFilename="on_street_proyectos"
          />
        )}
      </section>
    </div>
  );
}
