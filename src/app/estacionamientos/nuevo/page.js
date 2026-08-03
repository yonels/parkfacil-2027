import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstacionamientoForm from "@/components/estacionamientos/EstacionamientoForm";

export default function NuevoEstacionamientoPage() {
  return <AppShell title="Nuevo estacionamiento" description="Creación de una instalación"><div className="space-y-6"><PageHeader title="Nuevo estacionamiento" description="Completa los datos administrativos de la instalación." actions={[<Link key="back" href="/estacionamientos" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[#3150D8] hover:text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver</Link>]} /><EstacionamientoForm /></div></AppShell>;
}
