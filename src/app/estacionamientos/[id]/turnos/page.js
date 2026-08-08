import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ParkingShiftsManager from "@/components/estacionamientos/ParkingShiftsManager";
import { getParkingPageData } from "@/lib/estacionamientosServer";
import { getStructurePageData } from "@/lib/parkingStructureServer";

export default async function ParkingShiftsPage({ params }) {
  const { id } = await params;
  const parking = await getParkingPageData(id);
  const structure = parking ? await getStructurePageData(parking) : null;

  if (!parking) {
    return <AppShell title="Turnos del estacionamiento" description="Estacionamiento no encontrado"><div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-semibold text-[#041E42]">No se encontró el estacionamiento solicitado.</p></div></AppShell>;
  }

  return <AppShell title="Turnos del estacionamiento" description={parking.name}><div className="space-y-6">
    <PageHeader title="Turnos" description={`${parking.name} · ${parking.code}`} backHref={`/estacionamientos/${parking.code}/configuracion`} />
    <ParkingShiftsManager parking={parking} structure={structure} />
  </div></AppShell>;
}