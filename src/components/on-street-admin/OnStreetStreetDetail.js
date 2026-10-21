"use client";
// Ficha nativa On Street de una Calle (§2 de la reorganización 2026-08-28,
// mismo patrón que OnStreetAreaDetail.js). Reutiliza StructureEntityForm
// (kind="street") para editar la calle. Los Tramos se listan/editan con
// OnStreetTramosManager (corrección UX "Proyectos On Street" 2026-08-29,
// punto 3): mismo modelo Tramo A/B/C + código automático ya aprobado para el
// constructor de Proyecto -- StreetSegmentsManager.js (Off Street, vía
// StructureRoute.js) queda intacto, sin tocar.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";
import StructureEntityForm from "@/components/estacionamientos/StructureEntityForm";
import OnStreetTramosManager from "./OnStreetTramosManager";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo", MAINTENANCE: "En mantenimiento" };

export default function OnStreetStreetDetail({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/calles/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar la calle.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  if (loading) return <AppShell title="Calle On Street" description="Cargando"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></AppShell>;
  if (error) return <AppShell title="Calle On Street" description="Error"><p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p></AppShell>;
  if (!data) return null;

  const { street, parking, area } = data;
  const fichaHref = `/on-street-qr/calles/${id}`;

  return (
    <AppShell title={street.name} description="Calle On Street">
    <div className="space-y-6">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500">
        <Link href="/on-street-qr" className="hover:text-[var(--pf-color-onstreet-primary)]">On Street</Link>
        <span>/</span>
        <Link href="/on-street-qr/areas" className="hover:text-[var(--pf-color-onstreet-primary)]">Ubicaciones</Link>
        <span>/</span>
        <Link href="/on-street-qr/calles" className="hover:text-[var(--pf-color-onstreet-primary)]">Calles</Link>
        <span>/</span>
        <span className="text-slate-700">{street.name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#041E42]">{street.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{parking.companyName} · {parking.name} · {area?.name || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* "Volver" real de historial (2026-08-30) -- ver nota en OnStreetAdminPage.js. */}
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver</button>
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white"><Pencil className="h-4 w-4" />Editar</button>
          ) : null}
        </div>
      </div>

      {editing ? (
        <StructureEntityForm
          kind="street"
          parking={parking}
          parent={area}
          entity={street}
          cancelHref={fichaHref}
          onSaved={() => { setEditing(false); void load(); }}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo label="Empresa" valor={parking.companyName} />
            <Campo label="Estacionamiento" valor={parking.name} />
            <Campo label="Área" valor={area?.name || "—"} />
            <Campo label="Nombre de la Calle" valor={street.name} />
            <Campo label="Estado" valor={ESTADO_LABEL[street.status] || street.status || "—"} />
            <Campo label="Capacidad" valor={street.capacity ?? "—"} />
            <Campo label="Creación" valor={dt(street.created_at)} />
            <Campo label="Última actualización" valor={dt(street.updated_at)} />
            {street.district ? <Campo label="Comuna/zona" valor={street.district} /> : null}
            {street.notes ? <Campo label="Observaciones" valor={street.notes} span /> : null}
          </dl>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[#041E42]">Tramos de la calle</h2>
        {area ? <OnStreetTramosManager parking={parking} area={area} street={street} /> : (
          <p className="text-sm text-slate-500">No fue posible determinar el área de esta calle.</p>
        )}
      </section>
    </div>
    </AppShell>
  );
}

function Campo({ label, valor, span = false }) {
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{valor}</dd>
    </div>
  );
}
