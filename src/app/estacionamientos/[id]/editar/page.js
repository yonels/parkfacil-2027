import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EstacionamientoForm from "@/components/estacionamientos/EstacionamientoForm";
import { getParkingPageData } from "@/lib/estacionamientosServer";
import { getStructurePageData } from "@/lib/parkingStructureServer";

export default async function EditarEstacionamientoPage({ params }) {
  const { id } = await params;
  const parking = await getParkingPageData(id);
  const structure = parking ? await getStructurePageData(parking) : null;
  if (!parking) return <AppShell title="Editar estacionamiento" description="Dato inexistente"><div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-semibold">No se encontró el estacionamiento solicitado.</p><Link href="/estacionamientos" className="mt-3 inline-block text-sm font-semibold text-[#3150D8]">Volver</Link></div></AppShell>;
  return <AppShell title={`Editar ${parking.name}`} description="Edición administrativa"><div className="space-y-6"><PageHeader title={`Editar ${parking.name}`} description={`${parking.code} · datos generales y estructura operacional`} actions={[<Link key="back" href={`/estacionamientos/${parking.code}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-[#041E42] hover:border-[#3150D8] hover:text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver</Link>]} /><EstacionamientoForm parking={parking} structure={structure} /></div></AppShell>;
}
