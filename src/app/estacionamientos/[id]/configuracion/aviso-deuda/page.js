import AppShell from "@/components/layout/AppShell";
import DebtNoticeSettings from "@/components/estacionamientos/DebtNoticeSettings";

export default async function AvisoDeudaConfiguracionPage({ params }) {
  const { id } = await params;
  return (
    <AppShell title="Aviso de deuda pendiente" description="Off Street · Vehículos que se retiraron sin pagar">
      <DebtNoticeSettings parkingId={id} />
    </AppShell>
  );
}
