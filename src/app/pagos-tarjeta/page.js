import AppShell from "@/components/layout/AppShell";
import CardPaymentAttemptsManager from "@/components/pagos-tarjeta/CardPaymentAttemptsManager";

export default function PagosTarjetaPage() {
  return (
    <AppShell title="Pagos con tarjeta" description="Off Street · Intentos de pago del POS, pendientes e inciertos">
      <CardPaymentAttemptsManager />
    </AppShell>
  );
}
