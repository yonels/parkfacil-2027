import AppShell from "@/components/layout/AppShell";
import ShiftRulesSettings from "@/components/estacionamientos/ShiftRulesSettings";

export default async function ReglasTurnosConfiguracionPage({ params }) {
  const { id } = await params;
  return (
    <AppShell title="Reglas de turnos" description="Off Street · Inicio, término y relevo de turnos en el POS">
      <ShiftRulesSettings parkingId={id} />
    </AppShell>
  );
}
