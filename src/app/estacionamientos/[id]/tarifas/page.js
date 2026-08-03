import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import ParkingRatesManager from "@/components/estacionamientos/ParkingRatesManager";
import { getParkingPageData } from "@/lib/estacionamientosServer";

export default async function ParkingRatesPage({ params }) {
  const { id } = await params;
  const parking = await getParkingPageData(id);
  if (!parking) return <AppShell title="Tarifas operacionales" description="Estacionamiento no encontrado"><p>No se encontró el estacionamiento.</p></AppShell>;
  return <AppShell title="Tarifas operacionales" description={parking.name}><div className="space-y-5"><Link href={`/estacionamientos/${parking.code}/configuracion`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#3150D8]"><ArrowLeft className="h-4 w-4" /> Volver al configurador</Link><ParkingRatesManager parking={parking} /></div></AppShell>;
}
