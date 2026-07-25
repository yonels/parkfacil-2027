import Link from "next/link";
import { ArrowLeft, Building2, CarFront, Clock3, MapPin, Layers3, CircleSlash2, Smartphone, DoorOpen } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { getEstacionamientoById } from "@/data/estacionamientos.mjs";

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

export default function EstacionamientoDetallePage({ params }) {
  const estacionamiento = getEstacionamientoById(params.id);

  if (!estacionamiento) {
    return (
      <AppShell title="Detalle de estacionamiento" description="Instalación no encontrada">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">No se encontró el estacionamiento solicitado.</p>
          <Link href="/estacionamientos" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" /> Volver al catálogo
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={estacionamiento.nombre} description="Vista base del detalle de instalaciones">
      <div className="space-y-6">
        <PageHeader
          title={estacionamiento.nombre}
          description={`${estacionamiento.codigo} · ${estacionamiento.ciudad}`}
          actions={[
            <Link key="volver" href="/estacionamientos" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge variant="positive">{estacionamiento.estadoOperacional}</StatusBadge>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">{estacionamiento.estado}</span>
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Resumen general</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Vista estructural para el módulo de estacionamientos, preparada para futuras operaciones y conectividad con sistemas reales.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Dirección" value={estacionamiento.direccion} />
              <DetailItem label="Ciudad" value={estacionamiento.ciudad} />
              <DetailItem label="Horario" value={estacionamiento.horarios} />
              <DetailItem label="Capacidad" value={`${estacionamiento.capacidad} plazas`} />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><CarFront className="h-5 w-5" /><h3 className="text-lg font-semibold">Estado del sitio</h3></div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Accesos</span><strong>{estacionamiento.accesos}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Dispositivos</span><strong>{estacionamiento.dispositivos}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Salidas</span><strong>{estacionamiento.salidas}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Niveles</span><strong>{estacionamiento.niveles}</strong></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Detalles operacionales</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailItem label="Zonas" value={estacionamiento.zonas} />
            <DetailItem label="Niveles" value={estacionamiento.niveles} />
            <DetailItem label="Accesos" value={estacionamiento.accesos} />
            <DetailItem label="Salidas" value={estacionamiento.salidas} />
            <DetailItem label="Dispositivos" value={estacionamiento.dispositivos} />
            <DetailItem label="Estado operacional" value={estacionamiento.estadoOperacional} />
          </div>
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-[#041E42]">Próximas etapas</p>
            <p className="mt-2">Se mostrarán indicadores de ocupación, alertas, zonas de reserva, accesos controlados y eventos operativos en futuras iteraciones.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
