import Link from "next/link";
import { ArrowLeft, ArrowRight, BellRing, CircleAlert, RadioTower, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import AppShell from "@/components/layout/AppShell";

const alerts = [
  { id: "ALT-001", parking: "Parking Centro", source: "Barrera acceso A1", status: "Requiere revisión", tone: "bg-rose-50 text-rose-700" },
  { id: "ALT-002", parking: "Parking Norte", source: "Lector QR B2", status: "En seguimiento", tone: "bg-amber-50 text-amber-700" },
  { id: "ALT-003", parking: "Parking Sur", source: "Cámara salida C3", status: "Informativa", tone: "bg-blue-50 text-[#3150D8]" },
];

export default function MonitoreoPage() {
  return (
    <AppShell title="Monitoreo" description="Dispositivos, conectividad y alertas operativas">
      <div className="space-y-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-semibold text-cyan-200">Centro operativo</p><h1 className="mt-2 text-3xl font-semibold">Monitoreo de la plataforma</h1><p className="mt-2 text-sm text-slate-300">Consulta el estado de los dispositivos y las alertas de los estacionamientos.</p></div>
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft className="h-4 w-4" />Volver</Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Dispositivos", value: 86, description: "Inventario registrado", icon: RadioTower, href: "/dispositivos", color: "text-[#3150D8]" },
            { label: "En línea", value: 81, description: "Operación normal", icon: Wifi, href: "/dispositivos", color: "text-emerald-700" },
            { label: "Sin conexión", value: 5, description: "Requieren revisión", icon: WifiOff, href: "/dispositivos", color: "text-rose-700" },
            { label: "Alertas abiertas", value: 4, description: "Eventos en seguimiento", icon: BellRing, href: "/notificaciones", color: "text-amber-700" },
          ].map(({ label, value, description, icon: Icon, href, color }) => (
            <Link key={label} href={href} className="group flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3150D8] hover:shadow-md">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-50"><Icon className={`h-6 w-6 ${color}`} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-500">{label}</span><span className="mt-1 block text-3xl font-bold text-[#041E42]">{value}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
              <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#3150D8]" />
            </Link>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <Link href="/dispositivos" className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[#3150D8] hover:shadow-md">
            <div className="flex items-start justify-between"><span className="rounded-2xl bg-[#EEF4FF] p-3 text-[#3150D8]"><RadioTower className="h-6 w-6" /></span><ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#3150D8]" /></div>
            <h2 className="mt-5 text-xl font-bold text-[#041E42]">Estado de dispositivos</h2><p className="mt-2 text-sm leading-6 text-slate-600">Revisa barreras, lectores, cámaras, conectividad y el detalle técnico de cada equipo.</p>
          </Link>
          <Link href="/notificaciones" className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[#3150D8] hover:shadow-md">
            <div className="flex items-start justify-between"><span className="rounded-2xl bg-amber-50 p-3 text-amber-700"><BellRing className="h-6 w-6" /></span><ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#3150D8]" /></div>
            <h2 className="mt-5 text-xl font-bold text-[#041E42]">Alertas y notificaciones</h2><p className="mt-2 text-sm leading-6 text-slate-600">Consulta eventos críticos, notificaciones pendientes y trazabilidad de atención.</p>
          </Link>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><CircleAlert className="h-5 w-5 text-amber-700" /><div><h2 className="font-bold text-[#041E42]">Eventos recientes</h2><p className="text-xs text-slate-500">Selecciona una fila para abrir el centro de notificaciones.</p></div></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#041E42] text-white"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Estacionamiento</th><th className="px-4 py-3">Origen</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Detalle</th></tr></thead><tbody>{alerts.map((alert) => <tr key={alert.id} className="border-b border-slate-100 last:border-b-0 hover:bg-[#EEF4FF]"><td className="p-0"><Link href="/notificaciones" className="block px-4 py-3 font-bold text-[#3150D8]">{alert.id}</Link></td><td className="p-0"><Link href="/notificaciones" className="block px-4 py-3">{alert.parking}</Link></td><td className="p-0"><Link href="/notificaciones" className="block px-4 py-3">{alert.source}</Link></td><td className="p-0"><Link href="/notificaciones" className="block px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alert.tone}`}>{alert.status}</span></Link></td><td className="p-0"><Link href="/notificaciones" className="flex items-center gap-2 px-4 py-3 font-semibold text-[#3150D8]">Abrir <ArrowRight className="h-4 w-4" /></Link></td></tr>)}</tbody></table>
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 bg-emerald-50 px-5 py-3 text-xs text-emerald-800"><ShieldCheck className="h-4 w-4" />81 de 86 dispositivos se encuentran operativos.</div>
        </section>
      </div>
    </AppShell>
  );
}
