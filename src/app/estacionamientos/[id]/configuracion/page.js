import AppShell from "@/components/layout/AppShell";
import ParkingConfigurator from "@/components/estacionamientos/ParkingConfigurator";
export default async function ConfiguracionPage({ params }) {
  const { id } = await params;
  return <AppShell title="Configurar estacionamiento" description="Configuración progresiva"><ParkingConfigurator parkingId={id} /></AppShell>;
}
