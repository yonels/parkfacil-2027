import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";

// Lo que ve un cliente en Convenios (SOL-2026-11-04-006): no se le muestra la lista demostrativa.
export default function ConveniosSinDatos() {
  return <AppShell title="Convenios y Beneficios" description="Convenios de tu empresa">
    <div className="space-y-6">
      <PageHeader title="Convenios y Beneficios" description="Convenios de tu empresa." />
      <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">Tu empresa aún no tiene convenios registrados.</p>
    </div>
  </AppShell>;
}
