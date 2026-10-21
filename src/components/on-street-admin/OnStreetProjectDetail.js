"use client";
// Ficha de Proyecto On Street (§17-24 del brief "Proyectos On Street",
// 2026-08-28). El "Proyecto" es el Estacionamiento real (ver
// listOnStreetProjects/getOnStreetProjectDetail) -- esta ficha organiza en
// pestañas accesos a lo que YA existe (Ubicaciones QR, Generar QR, Áreas/
// Calles/Tramos, Tarifas, Sesiones/Pagos, Reportes), sin reconstruir
// ninguno: cada pestaña reutiliza la página real correspondiente, pasando
// el contexto (?parkingId=...) para que llegue ya filtrado -- no se
// duplica arquitectura por pestaña (§17 del brief: "No es obligatorio
// construir arquitectura nueva para cada pestaña").
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { authenticatedFetch } from "@/lib/supabaseBrowser";
import AppShell from "@/components/layout/AppShell";
import ParkingRatesManager from "@/components/estacionamientos/ParkingRatesManager";
import OnStreetProjectQrPanel from "./OnStreetProjectQrPanel";

const money = (v) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(v || 0);
const STATE_LABEL = { DRAFT: "Borrador", CONFIGURING: "En configuración", READY_FOR_REVIEW: "Listo para revisión", ACTIVE: "Activo", INACTIVE: "Inactivo", SUSPENDED: "Suspendido", CLOSED: "Cerrado" };

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "estructura", label: "Estructura" },
  { key: "qr", label: "QR" },
  { key: "tarifas", label: "Tarifas" },
  { key: "inspectores", label: "Inspectores" },
  { key: "operacion", label: "Operación" },
  { key: "reportes", label: "Reportes" },
];

function TarjetaEnlace({ href, titulo, descripcion }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[var(--pf-color-onstreet-primary)]">
      <div>
        <p className="font-bold text-[#041E42]">{titulo}</p>
        <p className="mt-1 text-sm text-slate-500">{descripcion}</p>
      </div>
      <ExternalLink className="h-5 w-5 shrink-0 text-[var(--pf-color-onstreet-primary)]" aria-hidden="true" />
    </Link>
  );
}

export default function OnStreetProjectDetail({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("resumen");

  const load = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/on-street-qr/proyectos/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
      if (!response.ok) throw new Error(body.error || "No fue posible cargar el proyecto.");
      setData(body.data);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  if (loading) return <AppShell title="Proyecto On Street" description="Cargando"><div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">Cargando…</div></AppShell>;
  if (error) return <AppShell title="Proyecto On Street" description="Error"><p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p></AppShell>;
  if (!data) return null;

  const qs = `?parkingId=${encodeURIComponent(id)}`;

  return (
    <AppShell title={data.name} description="Proyecto On Street">
      <div className="space-y-6">
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-slate-500">
          <Link href="/on-street-qr" className="hover:text-[var(--pf-color-onstreet-primary)]">On Street</Link>
          <span>/</span>
          <Link href="/on-street-qr/proyectos" className="hover:text-[var(--pf-color-onstreet-primary)]">Proyectos On Street</Link>
          <span>/</span>
          <span className="text-slate-700">{data.name}</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-[#041E42]">PROYECTO: {data.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{data.companyName} · {STATE_LABEL[data.status] || data.status}</p>
          </div>
          {/* "Volver" real de historial (2026-08-30) -- ver nota en OnStreetAdminPage.js. */}
          <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Volver</button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-t-xl px-4 py-2 text-sm font-bold transition ${tab === t.key ? "bg-[var(--pf-color-onstreet-primary)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "resumen" ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Campo label="Vehículos estacionados ahora" valor={String(data.activeVehicles)} />
              <Campo label="Sesiones hoy" valor={String(data.sessionsToday)} />
              <Campo label="Recaudación hoy" valor={money(data.revenueToday)} />
            </dl>
            <p className="mt-4 text-xs text-slate-400">Inspectores no aparece aquí: son cuentas de alcance global (§20/§22), no asignadas a un Proyecto específico — ver pestaña Inspectores.</p>

            {/* Corrección "Resumen sin acciones de activación duplicadas"
                (2026-08-30): el bloque Revisión/Activación se retiró de
                aquí -- la activación del proyecto se realiza únicamente en
                la etapa "Revisión" del flujo Estructura → QR → Revisión
                (constructor de Proyecto), que sigue usando el mismo
                componente único OnStreetProjectActivation sin cambios. */}
          </section>
        ) : null}

        {tab === "estructura" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <TarjetaEnlace href={`/on-street-qr/areas${qs}`} titulo="Áreas" descripcion="Ver y administrar las áreas de este proyecto." />
            <TarjetaEnlace href={`/on-street-qr/calles${qs}`} titulo="Calles" descripcion="Ver y administrar las calles de este proyecto." />
            <TarjetaEnlace href={`/on-street-qr/tramos${qs}`} titulo="Tramos" descripcion="Ver y administrar los tramos de este proyecto." />
          </div>
        ) : null}

        {/* Corrección UX/funcional "Proyectos On Street" (2026-08-29, punto
            1): "+ Nueva ubicación QR" sin salir del Proyecto -- reutiliza el
            mismo generador único (OnStreetQrCreateWorkspace, modo compact),
            ya no navega a otra página. */}
        {tab === "qr" ? <OnStreetProjectQrPanel parkingId={id} /> : null}

        {/* Cierre integral del flujo (2026-08-30, §44): mismo componente que
            la etapa Tarifas del constructor de Proyecto -- ParkingRatesManager
            embebido directo, no un enlace a otra pantalla. */}
        {tab === "tarifas" ? <ParkingRatesManager key={data.id} parking={{ code: data.code, name: data.name }} /> : null}

        {tab === "inspectores" ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            <p>Los Inspectores operan con alcance <strong>global</strong> (decisión funcional aprobada, §20) — no existe una relación real en el modelo que los asigne a un Proyecto específico, así que no se inventa una aquí.</p>
            <Link href={`/on-street-qr/inspectores${qs}`} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--pf-color-onstreet-primary)] px-4 py-2 text-sm font-bold text-white">Ver Inspectores <ExternalLink className="h-4 w-4" /></Link>
          </div>
        ) : null}

        {tab === "operacion" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TarjetaEnlace href={`/on-street-qr/sesiones${qs}`} titulo="Sesiones" descripcion="Sesiones de este proyecto, con el período HOY/7 DÍAS/MES/AÑO/PERSONALIZADO." />
            <TarjetaEnlace href={`/on-street-qr/pagos${qs}`} titulo="Pagos" descripcion="Pagos de este proyecto, con el mismo sistema de período." />
          </div>
        ) : null}

        {tab === "reportes" ? (
          <TarjetaEnlace href={`/on-street-qr/reportes${qs}`} titulo="Reportes" descripcion={`Reportes On Street, ya filtrados por "${data.name}".`} />
        ) : null}
      </div>
    </AppShell>
  );
}

function Campo({ label, valor }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-slate-800">{valor}</dd>
    </div>
  );
}
