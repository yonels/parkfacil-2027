import Link from "next/link";
import { Building2, ShieldCheck, FileSearch, ArrowRight } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ModuleCard from "@/components/ui/ModuleCard";
import StatusBadge from "@/components/ui/StatusBadge";
import { getOrganizationProfiles, getSecurityModules } from "@/lib/seguridad.mjs";

const icons = {
  ShieldCheck,
  Building2,
  FileSearch,
};

export default function SeguridadPage() {
  const modules = getSecurityModules();
  const organizations = getOrganizationProfiles();

  return (
    <AppShell title="Seguridad y Organizaciones" description="Vista de referencia para la Etapa 02">
      <div className="space-y-6">
        <PageHeader
          title="Seguridad y Organizaciones"
          description="Esta vista representa el comienzo del módulo institucional para controles de acceso, organizaciones y auditoría, sin desarrollar lógica operativa real."
          actions={[
            <Link key="documentos" href="/documentos" className="inline-flex items-center gap-2 rounded-full bg-[#3150D8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1E5EFF]">
              Ver documentación
              <ArrowRight className="h-4 w-4" />
            </Link>,
          ]}
        />

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-[#041E42]">Módulos de referencia</h3>
                <p className="mt-2 text-sm text-slate-600">Estructura visual preparada para evolucionar hacia permisos y organización real.</p>
              </div>
              <StatusBadge variant="warning">Etapa 02</StatusBadge>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => {
                const Icon = icons[module.icon] || ShieldCheck;
                return (
                  <ModuleCard key={module.title} title={module.title} description={module.description} icon={Icon} href={null} state={module.state} />
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-[#5271E8] bg-[#3150D8] p-6 text-white shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">Estado del módulo</p>
            <h3 className="mt-4 text-2xl font-semibold">Seguridad institucional</h3>
            <ul className="mt-5 space-y-3 text-sm text-blue-100">
              <li>• Base visual preparada</li>
              <li>• Organizaciones y roles listados</li>
              <li>• Sin datos operativos reales</li>
              <li>• Apto para evolución posterior</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-[#041E42]">Organizaciones de referencia</h3>
              <p className="mt-2 text-sm text-slate-600">Vista estructural para representar áreas, cobertura y estados de preparación.</p>
            </div>
            <StatusBadge variant="positive">Referencia</StatusBadge>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {organizations.map((organization) => (
              <div key={organization.name} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-[#3150D8]">{organization.name}</p>
                <p className="mt-2 text-sm text-slate-600">{organization.scope}</p>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="rounded-full bg-white px-3 py-1 text-slate-600">{organization.status}</span>
                  <span className="font-semibold text-[#041E42]">Cobertura {organization.coverage}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
