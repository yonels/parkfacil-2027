import AppShell from "@/components/layout/AppShell";
import ParkingConfigurator from "@/components/estacionamientos/ParkingConfigurator";
export default async function RevisionPage({ params }) {
  const { id } = await params;
  return <AppShell title="Revisión del estacionamiento" description="Validación previa a la activación"><ParkingConfigurator parkingId={id} review /></AppShell>;
}
