import Link from "next/link";
import { ArrowLeft, Building2, Cpu, MonitorSmartphone, Network, Wrench, AlertTriangle, History } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EstadoConexionBadge from "@/components/dispositivos/EstadoConexionBadge";
import { getDispositivoById } from "@/data/dispositivos.mjs";
import { getEstacionamientoById } from "@/data/estacionamientos.mjs";

function DetailItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-[#041E42]">{value}</p>
    </div>
  );
}

export default function DispositivoDetallePage({ params }) {
  const dispositivo = getDispositivoById(params.id);

  if (!dispositivo) {
    return (
      <AppShell title="Detalle de dispositivo" description="Dispositivo no encontrado">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[#041E42]">No se encontró el dispositivo solicitado.</p>
          <Link href="/dispositivos" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]">
            <ArrowLeft className="h-4 w-4" /> Volver al inventario
          </Link>
        </div>
      </AppShell>
    );
  }

  const estacionamiento = dispositivo.estacionamientoId && dispositivo.estacionamientoId !== "sin-asignar"
    ? getEstacionamientoById(dispositivo.estacionamientoId)
    : null;

  return (
    <AppShell title={dispositivo.nombre} description="Detalle visual del dispositivo">
      <div className="space-y-6">
        <PageHeader
          title={dispositivo.nombre}
          description={`${dispositivo.codigo} · ${dispositivo.marca} ${dispositivo.modelo}`}
          actions={[
            <Link key="volver" href="/dispositivos" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>,
          ]}
        />

        <section className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge variant="positive">{dispositivo.estadoOperacional}</StatusBadge>
              <EstadoConexionBadge conexion={dispositivo.conexion} />
            </div>
            <h3 className="mt-5 text-2xl font-semibold text-[#041E42]">Información general</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">{dispositivo.descripcion}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <DetailItem label="Tipo" value={dispositivo.tipo} />
              <DetailItem label="Marca" value={dispositivo.marca} />
              <DetailItem label="Modelo" value={dispositivo.modelo} />
              <DetailItem label="Ubicación" value={dispositivo.ubicacion} />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-[#F5F9FF] p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[#3150D8]"><Cpu className="h-5 w-5" /><h3 className="text-lg font-semibold">Identificación técnica</h3></div>
            <div className="mt-6 space-y-4 text-sm text-slate-600">
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Código</span><strong>{dispositivo.codigo}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>IP</span><strong>{dispositivo.ip ?? "N/A"}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Firmware</span><strong>{dispositivo.firmware}</strong></div>
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3"><span>Última comunicación</span><strong>{dispositivo.ultimaComunicacion}</strong></div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Asignación y conectividad</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem label="Estacionamiento" value={estacionamiento?.nombre ?? "Sin asignación"} />
            <DetailItem label="Ubicación interna" value={dispositivo.ubicacion} />
            <DetailItem label="Conectividad" value={dispositivo.conexion} />
            <DetailItem label="Dirección IP" value={dispositivo.ip ?? "Sin IP"} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Configuración y mantenimiento</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Wrench className="h-5 w-5" /><h4 className="font-semibold">Mantenimiento</h4></div>
              <p className="mt-3 text-sm text-slate-600">{dispositivo.mantenimiento}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><AlertTriangle className="h-5 w-5" /><h4 className="font-semibold">Alertas</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {dispositivo.alertas.map((alerta) => <li key={alerta}>• {alerta}</li>)}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-[#041E42]">Historial y etapas futuras</h3>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><History className="h-5 w-5" /><h4 className="font-semibold">Historial</h4></div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {dispositivo.historial.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-[#3150D8]"><Network className="h-5 w-5" /><h4 className="font-semibold">Estado operacional</h4></div>
              <p className="mt-3 text-sm text-slate-600">{dispositivo.estadoOperacional}. Se incorporarán acciones operativas y monitoreo en futuras etapas.</p>
            </div>
          </div>
          <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-[#041E42]">Etapa futura</p>
            <p className="mt-2">Las vistas de auditoría, eventos y control remoto se habilitarán en próximas iteraciones sin ejecutar acciones reales sobre equipos.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
