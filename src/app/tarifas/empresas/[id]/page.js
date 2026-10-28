import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import PlanEmpresaPanel from "@/components/tarifas/PlanEmpresaPanel";
import { getCurrentServerContext } from "@/lib/auth/currentServerContext";
import { ROLES } from "@/lib/auth/permissions.mjs";

// Plan de la empresa (SOL-2026-10-28-002): se abre con doble clic en la tabla
// «Empresas y planes asignados» de Planes. Solo Root (la API también lo exige).
export default async function PlanEmpresaPage({ params }) {
  const { id } = await params;
  const context = await getCurrentServerContext().catch(() => null);
  const isRoot = context?.role === ROLES.PLATFORM_ADMIN;

  return (
    <AppShell title="Plan de la empresa" description="Planes comerciales por contrato">
      <div className="space-y-6">
        <PageHeader
          title="Plan de la empresa"
          description="Plan vigente de cada contrato, cambios con fecha de vigencia e historial."
          showBack={false}
          actions={[
            <Link key="volver" href="/tarifas" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#3150D8] hover:text-[#3150D8]">
              <ArrowLeft className="h-4 w-4" /> Volver a Planes
            </Link>,
          ]}
        />
        {isRoot ? <PlanEmpresaPanel companyId={id} /> : (
          <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-600">Solo ParkFacil Root puede gestionar los planes de una empresa.</p>
        )}
      </div>
    </AppShell>
  );
}
