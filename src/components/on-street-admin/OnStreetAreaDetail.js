"use client";
// Ficha nativa On Street de un Área (§2/§3 de la reorganización 2026-08-28):
// vive bajo /on-street-qr/areas/[id] -- el usuario NUNCA termina
// visualmente en el árbol Off Street. Reutiliza StructureEntityForm
// (mismo formulario/validación/endpoint PATCH ya existente y probado de
// Off Street) para la edición, pasándole cancelHref/onSaved apuntando de
// vuelta a esta misma ficha -- ver el comentario en StructureEntityForm.js.
// No se duplica ninguna lógica de negocio: solo se envuelve en contexto,
// navegación y breadcrumb propios de On Street.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";
import StructureEntityForm from "@/components/estacionamientos/StructureEntityForm";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const ESTADO_LABEL = { ACTIVE: "Activo", INACTIVE: "Inactivo", MAINTENANCE: "En mantenimiento" };

export default function OnStreetAreaDetail({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/areas/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el área.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  if (loading) return <AppShell title="Área On Street" description="Cargando"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></AppShell>;
  if (error) return <AppShell title="Área On Street" description="Error"><p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p></AppShell>;
  if (!data) return null;

  const { area, parking, streets } = data;
  const fichaHref = `/on-street-qr/areas/${id}`;

  return (
    <AppShell title={area.name} description="Área On Street">
    <div className="space-y-6">
      {/* Breadcrumb On Street (§3: "El menú activo debe permanecer en ON STREET, NO cambiar al árbol Off Street") */}
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500">
        <Link href="/on-street-qr" className="hover:text-[var(--pf-color-onstreet-primary)]">On Street</Link>
        <span>/</span>
        <Link href="/on-street-qr/areas" className="hover:text-[var(--pf-color-onstreet-primary)]">Ubicaciones</Link>
        <span>/</span>
        <Link href="/on-street-qr/areas" className="hover:text-[var(--pf-color-onstreet-primary)]">Áreas</Link>
        <span>/</span>
        <span className="text-slate-700">{area.name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-[#041E42]">{area.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{parking.companyName} · {parking.name}</p>
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
          kind="sector"
          parking={parking}
          entity={area}
          cancelHref={fichaHref}
          onSaved={() => { setEditing(false); void load(); }}
        />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo label="Empresa" valor={parking.companyName} />
            <Campo label="Estacionamiento" valor={parking.name} />
            <Campo label="Nombre del Área" valor={area.name} />
            <Campo label="Código" valor={area.code || "—"} />
            <Campo label="Estado" valor={ESTADO_LABEL[area.status] || area.status || "—"} />
            <Campo label="Capacidad" valor={area.capacity ?? "—"} />
            <Campo label="Creación" valor={dt(area.created_at)} />
            <Campo label="Última actualización" valor={dt(area.updated_at)} />
            {area.description ? <Campo label="Descripción" valor={area.description} span /> : null}
            {area.notes ? <Campo label="Observaciones" valor={area.notes} span /> : null}
          </dl>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#041E42]">Calles del área</h2>
          <Link
            href={`/on-street-qr/calles/nueva?parkingId=${encodeURIComponent(parking.id)}&areaId=${encodeURIComponent(id)}`}
            className="rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            + Nueva calle
          </Link>
        </div>
        {streets.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Esta área todavía no tiene calles registradas.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[500px] border-collapse text-left text-sm">
              <thead className="bg-[#E2F0D9] text-[#041E42]">
                <tr>{["Calle", "Estado", "N° Tramos", "Acción"].map((h) => <th key={h} className="border border-slate-200 px-3 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {streets.map((street) => (
                  <tr key={street.id} className="border-b border-slate-100">
                    <td className="border border-slate-200 px-3 py-2 font-semibold">{street.name}</td>
                    <td className="border border-slate-200 px-3 py-2">{ESTADO_LABEL[street.status] || street.status || "—"}</td>
                    <td className="border border-slate-200 px-3 py-2">{street.segmentCount}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Link href={`/on-street-qr/calles/${street.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[var(--pf-color-onstreet-primary)] hover:text-[var(--pf-color-onstreet-primary)]">Ficha</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
