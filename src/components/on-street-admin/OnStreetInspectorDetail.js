"use client";
// Ficha dedicada de Inspector (Etapa 3, cierre §5): reutiliza tal cual el
// GET/PATCH ya existentes de /api/on-street-qr/inspectores/[id] -- no se
// crea ningún endpoint nuevo ni una segunda administración de usuarios.
// Único cambio administrable: activar/desactivar (ya existía). Nunca
// permite tarifas/pagos/empresas/fiscalizaciones históricas -- esas
// acciones simplemente no existen en esta pantalla.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Power } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";

const dt = (v) => (v ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—");
const TYPE_LABELS = { OVERSTAY: "Exceso de tiempo", NO_SESSION: "Sin sesión", OTHER: "Otro" };

export default function OnStreetInspectorDetail({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/inspectores/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el inspector.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
      // Solo para mostrar/ocultar el botón activar/desactivar -- la
      // autorización real (server-side) vive en requirePlatformAdmin
      // dentro del PATCH, no aquí (mismo criterio que OnStreetInspectores.js).
      authenticatedFetch("/api/auth/session", { cache: "no-store" })
        .then((r) => r.json())
        .then((body) => setIsPlatformAdmin(body?.data?.role === "platform_admin"))
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function toggleActive() {
    setBusy(true);
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/inspectores/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !data.inspector.active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No fue posible actualizar el estado.");
      await load();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AppShell title="Inspector" description="Cargando"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></AppShell>;
  if (error) return <AppShell title="Inspector" description="Error"><p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p></AppShell>;
  if (!data) return null;

  const { inspector, activity } = data;
  const ultimaFiscalizacion = activity[0] || null;

  return (
    <AppShell title={inspector.fullName || inspector.email} description="Inspector On Street">
      <div className="space-y-6">
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500">
          <Link href="/on-street-qr" className="hover:text-[var(--pf-color-onstreet-primary)]">On Street</Link>
          <span>/</span>
          <Link href="/on-street-qr/inspectores" className="hover:text-[var(--pf-color-onstreet-primary)]">Inspectores</Link>
          <span>/</span>
          <span className="text-slate-700">{inspector.fullName || inspector.email}</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-[#041E42]">{inspector.fullName || inspector.email}</h1>
            <p className="mt-1 text-sm text-slate-500">{inspector.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* "Volver" real de historial (2026-08-30) -- ver nota en OnStreetAdminPage.js. */}
            <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver</button>
            {isPlatformAdmin ? (
              <button type="button" disabled={busy} onClick={toggleActive} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${inspector.active ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                <Power className="h-4 w-4" />{busy ? "Actualizando…" : inspector.active ? "Desactivar" : "Activar"}
              </button>
            ) : null}
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Identificación</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre" valor={inspector.fullName || "—"} />
            <Campo label="Email" valor={inspector.email} />
            <Campo label="Rol" valor="Inspector" />
            <Campo label="Estado" valor={inspector.active ? "Activo" : "Inactivo"} />
            <Campo label="Fecha de creación" valor={dt(inspector.createdAt)} />
            <Campo label="Último acceso" valor={dt(inspector.lastSignInAt)} />
          </dl>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">Actividad</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            <Campo label="Fiscalizaciones registradas" valor={String(activity.length)} />
            <Campo label="Última fiscalización" valor={ultimaFiscalizacion ? dt(ultimaFiscalizacion.inspected_at) : "—"} />
          </dl>

          {activity.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Sin fiscalizaciones registradas.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-[#E2F0D9] text-[#041E42]">
                  <tr>{["Fecha/hora", "Patente", "Motivo", "Ubicación"].map((h) => <th key={h} className="border border-slate-200 px-3 py-2 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {activity.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="border border-slate-200 px-3 py-2">{dt(row.inspected_at)}</td>
                      <td className="border border-slate-200 px-3 py-2 font-semibold">{row.license_plate_normalized}</td>
                      <td className="border border-slate-200 px-3 py-2">{TYPE_LABELS[row.inspection_type] || row.inspection_type}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.location?.label || "Sin ubicación"}</td>
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

function Campo({ label, valor }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{valor}</dd>
    </div>
  );
}
