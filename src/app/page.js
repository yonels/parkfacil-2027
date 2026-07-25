import Link from "next/link";
import { BarChart3, Building2, RadioTower, ShieldAlert, BookOpen, ArrowRight } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ModuleCard from "@/components/ui/ModuleCard";
import StatusBadge from "@/components/ui/StatusBadge";

const modules = [
  { title: "Operación", description: "Vista general de la operación y el control diario.", icon: Building2, href: null, state: "Próximamente" },
  { title: "Estacionamientos", description: "Gestión de disponibilidad y control de accesos.", icon: ShieldAlert, href: null, state: "Etapa futura" },
  { title: "Monitoreo", description: "Centro operativo para dispositivos y alertas.", icon: RadioTower, href: null, state: "Próximamente" },
];

export default function Home() {
  return (
    <AppShell title="Centro de Control" description="Plataforma base de ParkFacil 2027">
      <div className="space-y-6">
        <PageHeader
          title="Centro de Control ParkFacil"
          description="Esta vista representa la base visual de la plataforma operativa futura, con navegación, estructura y componentes reutilizables preparados para la evolución del producto."
          actions={[
            <Link key="documentos" href="/documentos" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              <BookOpen className="h-4 w-4" />
              Centro de Documentación
            </Link>,
          ]}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Estacionamientos" value="24" description="Demostración visual" icon={Building2} trend="+3% respecto a la última etapa" />
          <StatCard title="Operación" value="12" description="Módulo base preparado" icon={BarChart3} trend="En revisión" />
          <StatCard title="Dispositivos" value="86" description="Datos de ejemplo" icon={RadioTower} trend="Sin conexión real" />
          <StatCard title="Alertas" value="4" description="Indicadores de demostración" icon={ShieldAlert} trend="No operativa" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[#041E42]">Módulos principales</h3>
                <p className="mt-2 text-sm text-slate-600">La navegación base ya está lista para evolucionar hacia funcionalidades operativas.</p>
              </div>
              <StatusBadge variant="warning">En desarrollo</StatusBadge>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
                <ModuleCard key={module.title} title={module.title} description={module.description} icon={module.icon} href={module.href} state={module.state} />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-[#041E42] p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">Estado del proyecto</p>
            <h3 className="mt-4 text-2xl font-semibold">Framework Base</h3>
            <ul className="mt-5 space-y-3 text-sm text-slate-200">
              <li>• Etapa actual: Framework Base</li>
              <li>• Estado: En desarrollo</li>
              <li>• Documentación disponible</li>
              <li>• Última etapa cerrada: Fundación</li>
            </ul>
            <Link href="/documentos" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#041E42] transition hover:bg-slate-100">
              Explorar documentación <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
