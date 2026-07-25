import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeDollarSign,
  CalendarCheck2,
  Car,
  CircleDollarSign,
  Clock3,
  Gauge,
  Ticket,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import KpiCard from "@/components/dashboard/KpiCard";
import ChartCard from "@/components/dashboard/ChartCard";
import DataTable from "@/components/dashboard/DataTable";
import AlertList from "@/components/dashboard/AlertList";
import DeviceStatus from "@/components/dashboard/DeviceStatus";
import AccessStatus from "@/components/dashboard/AccessStatus";
import StatusCard from "@/components/dashboard/StatusCard";
import SystemStatusBar from "@/components/dashboard/SystemStatusBar";
import LineChartMini from "@/components/dashboard/LineChartMini";
import DonutRevenue from "@/components/dashboard/DonutRevenue";
import { getEstacionamientosDemo } from "@/data/estacionamientos.mjs";
import { getDispositivosDemo, getResumenEstados } from "@/data/dispositivos.mjs";
import { getControlAccesosDemo } from "@/data/controlAccesos.mjs";
import { getOperacionesDemo, getResumenOperativo, getTipoMovimientoLabel } from "@/data/operacion.mjs";
import { getConveniosDemo, filterConveniosProximosAVencer, formatValorDemostrativo } from "@/data/convenios.mjs";

const dateReference = "2026-07-25T10:15:00";

function formatCompactDate(value) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getDashboardModel() {
  const estacionamientos = getEstacionamientosDemo();
  const dispositivos = getDispositivosDemo();
  const accesos = getControlAccesosDemo();
  const operaciones = getOperacionesDemo();
  const resumenOperativo = getResumenOperativo(dateReference);
  const resumenDispositivos = getResumenEstados();
  const convenios = getConveniosDemo();
  const proximosConvenios = filterConveniosProximosAVencer(dateReference)
    .map((item) => ({
      id: item.id,
      title: item.nombre,
      days: Math.max(0, Math.ceil((new Date(item.vigencia.validUntil).getTime() - new Date(dateReference).getTime()) / (1000 * 60 * 60 * 24))),
      until: item.vigencia.validUntil,
    }))
    .sort((a, b) => a.days - b.days)
    .slice(0, 4);

  const capacidadTotal = estacionamientos.reduce((acc, item) => acc + item.capacidad, 0);
  const ocupacionActual = 68;
  const ingresosHoy = 1285650;
  const recaudacionHoy = 1241300;

  const alertasAccesos = accesos.reduce((acc, acceso) => {
    return acc + (acceso.incidencias || []).filter((item) => item !== "Sin incidencias").length;
  }, 0);
  const alertasDispositivos = dispositivos.reduce((acc, dispositivo) => {
    return acc + (dispositivo.alertas || []).filter((item) => item !== "Sin alertas").length;
  }, 0);

  const alertasActivas = alertasAccesos + alertasDispositivos;

  const accessStatus = accesos.slice(0, 5).map((item) => {
    let state = "Revision";
    if (item.estado === "active") state = "Abierta";
    if (["inactive", "blocked"].includes(item.estado)) state = "Cerrada";

    return {
      name: item.nombre,
      state,
    };
  });

  const deviceStatus = [
    { label: "En linea", value: dispositivos.filter((item) => item.conexion === "online").length, color: "#16A34A" },
    { label: "Advertencia", value: dispositivos.filter((item) => item.conexion === "warning").length, color: "#F59E0B" },
    { label: "Fuera de linea", value: dispositivos.filter((item) => item.conexion !== "online" && item.conexion !== "warning").length, color: "#DC2626" },
  ];

  const alertList = [
    ...accesos.flatMap((acceso) =>
      (acceso.incidencias || [])
        .filter((alerta) => alerta !== "Sin incidencias")
        .map((alerta, index) => ({
          id: `${acceso.id}-${index}`,
          title: acceso.nombre,
          detail: alerta,
          severity: "danger",
          severityLabel: "Critica",
          time: "15:40",
        })),
    ),
    ...dispositivos.flatMap((dispositivo) =>
      (dispositivo.alertas || [])
        .filter((alerta) => alerta !== "Sin alertas")
        .map((alerta, index) => ({
          id: `${dispositivo.id}-${index}`,
          title: dispositivo.nombre,
          detail: alerta,
          severity: "warning",
          severityLabel: "Aviso",
          time: "15:25",
        })),
    ),
  ].slice(0, 5);

  const activityRows = operaciones.slice(0, 5).map((item) => ({
    id: item.id,
    hora: item.fechaHora.slice(11, 16),
    tipo: getTipoMovimientoLabel(item.tipoMovimiento),
    usuario: item.patente,
    acceso: item.acceso,
    descripcion: item.observaciones,
    monto: item.tipoMovimiento.includes("exit") ? "$3.200" : item.tipoMovimiento.includes("entry") ? "$2.800" : "--",
  }));

  const rankingParking = estacionamientos
    .map((item, index) => {
      const factor = 0.25 + (index + 1) * 0.14;
      const amount = Math.round(ingresosHoy * factor);
      return {
        id: item.id,
        name: item.nombre,
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const paymentMix = [
    { label: "Efectivo", value: 531250, valueLabel: "$531.250", color: "#16A34A" },
    { label: "Tarjeta", value: 412800, valueLabel: "$412.800", color: "#1E5EFF" },
    { label: "Web/Movil", value: 251600, valueLabel: "$251.600", color: "#7C3AED" },
    { label: "Otros", value: 89000, valueLabel: "$89.000", color: "#F59E0B" },
  ];

  const kpis = [
    {
      title: "Vehiculos dentro",
      value: String(resumenOperativo.vehiculosDentro * 108),
      secondary: `${resumenOperativo.vehiculosDentro} activos en catalogo demo`,
      comparison: "12% vs ayer",
      trend: "up",
      icon: Car,
      accent: "#1E5EFF",
    },
    {
      title: "Ocupacion actual",
      value: `${ocupacionActual}%`,
      secondary: `${Math.round((capacidadTotal * ocupacionActual) / 100)} / ${capacidadTotal} espacios`,
      comparison: "2% vs ayer",
      trend: "up",
      icon: Gauge,
      accent: "#16A34A",
    },
    {
      title: "Ingresos del dia",
      value: formatValorDemostrativo(ingresosHoy),
      secondary: "Modelo demostrativo consolidado",
      comparison: "18% vs ayer",
      trend: "up",
      icon: CircleDollarSign,
      accent: "#3150D8",
    },
    {
      title: "Salidas del dia",
      value: String(resumenOperativo.salidasDia * 206),
      secondary: `${resumenOperativo.salidasDia} movimientos de referencia`,
      comparison: "9% vs ayer",
      trend: "up",
      icon: ArrowRightLeft,
      accent: "#F59E0B",
    },
    {
      title: "Recaudacion del dia",
      value: formatValorDemostrativo(recaudacionHoy),
      secondary: "97% del total de ingresos",
      comparison: "3% vs ayer",
      trend: "up",
      icon: BadgeDollarSign,
      accent: "#2EA8FF",
    },
    {
      title: "Alertas activas",
      value: String(alertasActivas),
      secondary: `${resumenDispositivos.alertas} en dispositivos`,
      comparison: "Requieren atencion",
      trend: "down",
      icon: TriangleAlert,
      accent: "#DC2626",
    },
  ];

  return {
    kpis,
    ocupacionSerie: [15, 10, 8, 6, 20, 45, 72, 88, 82, 60, 68],
    accessStatus,
    deviceStatus,
    alertList,
    activityRows,
    paymentMix,
    rankingParking,
    proximosConvenios,
    statusCards: [
      { title: "Tasa de rotacion", value: "2,8", subtitle: "veces al dia", icon: ArrowRightLeft, trendColor: "#1E5EFF", points: [22, 28, 24, 31, 29, 35, 30, 34] },
      { title: "Estadia promedio", value: "2h 15m", subtitle: "en operaciones demo", icon: Clock3, trendColor: "#0B3D91", points: [18, 20, 19, 23, 21, 24, 22, 25] },
      { title: "Ticket promedio", value: "$3.125", subtitle: "por salida procesada", icon: Ticket, trendColor: "#7C3AED", points: [16, 15, 19, 20, 18, 21, 17, 20] },
      { title: "Uso de abonados", value: "42%", subtitle: "del total ingresos", icon: UserRound, trendColor: "#1E5EFF", points: [13, 14, 16, 15, 17, 18, 17, 19] },
      { title: "Validaciones usadas", value: "156", subtitle: "hoy", icon: CalendarCheck2, trendColor: "#16A34A", points: [10, 12, 11, 15, 13, 16, 14, 15] },
      { title: "Reservas del dia", value: "28", subtitle: `${convenios.length} convenios activos demo`, icon: AlertTriangle, trendColor: "#1E5EFF", points: [8, 9, 8, 10, 11, 13, 12, 14] },
    ],
    systemStatus: [
      { label: "Sistema", value: "En linea", state: "online" },
      { label: "Ultimo respaldo", value: "Hace 15 min", state: "online" },
      { label: "Red principal", value: "Operativa", state: "online" },
      { label: "Red 4G respaldo", value: "Disponible", state: "warning" },
      { label: "Proximo respaldo", value: "Hoy 23:00", state: "warning" },
      { label: "Version", value: "2.6.0-demo", state: "online" },
    ],
  };
}

export default function Home() {
  const model = getDashboardModel();

  return (
    <AppShell title="Dashboard" description="Resumen general de la operacion">
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {model.kpis.map((kpi) => (
            <KpiCard key={kpi.title} {...kpi} />
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-12">
          <ChartCard title="Ocupacion por hora (Hoy)" className="xl:col-span-5">
            <LineChartMini points={model.ocupacionSerie} stroke="#1E5EFF" area="rgba(46,168,255,0.22)" maxY={100} />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span>
            </div>
          </ChartCard>

          <ChartCard title="Estado de accesos" actionLabel="Ver todos" className="xl:col-span-2">
            <AccessStatus items={model.accessStatus} />
          </ChartCard>

          <ChartCard title="Estado de dispositivos" actionLabel="Ver todos" className="xl:col-span-2">
            <DeviceStatus data={model.deviceStatus} />
          </ChartCard>

          <ChartCard title="Alertas recientes" actionLabel="Ver todas" className="xl:col-span-3">
            <AlertList items={model.alertList} />
          </ChartCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-12">
          <ChartCard title="Actividad reciente" actionLabel="Ver toda la actividad" className="xl:col-span-5">
            <DataTable
              columns={[
                { key: "hora", label: "Hora" },
                { key: "tipo", label: "Tipo" },
                { key: "usuario", label: "Patente / Usuario" },
                { key: "acceso", label: "Acceso" },
                { key: "monto", label: "Monto" },
              ]}
              rows={model.activityRows}
            />
          </ChartCard>

          <ChartCard title="Ingresos por medio de pago (Hoy)" className="xl:col-span-3">
            <DonutRevenue data={model.paymentMix} centerLabel="Total" centerValue={formatValorDemostrativo(1285650)} />
          </ChartCard>

          <ChartCard title="Top estacionamientos (Ingresos hoy)" className="xl:col-span-2">
            <div className="space-y-3">
              {model.rankingParking.map((item) => (
                <div key={item.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-semibold text-[#041E42]">{formatValorDemostrativo(item.amount)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-[#1E5EFF]" style={{ width: `${Math.min(100, Math.round((item.amount / model.rankingParking[0].amount) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Proximos a vencer" actionLabel="Ver todos" className="xl:col-span-2">
            <div className="space-y-2">
              {model.proximosConvenios.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <p className="text-xs font-semibold text-[#041E42]">{item.title}</p>
                  <p className="text-[11px] text-slate-500">Vence el {formatCompactDate(item.until)}</p>
                  <p className="mt-1 text-xs font-semibold text-[#1E5EFF]">{item.days} dias</p>
                </article>
              ))}
            </div>
          </ChartCard>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {model.statusCards.map((item) => (
            <StatusCard key={item.title} {...item} />
          ))}
        </section>

        <SystemStatusBar items={model.systemStatus} />
      </div>
    </AppShell>
  );
}
