import AppShell from "@/components/layout/AppShell";
import DebtsManager from "@/components/deudas/DebtsManager";

export default function DeudasPage() {
  return (
    <AppShell title="Deudas pendientes" description="Off Street · Vehículos que se retiraron sin pagar">
      <DebtsManager />
    </AppShell>
  );
}
