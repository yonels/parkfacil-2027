"use client";

import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ReleasedPaymentManager from "@/components/pagoLiberado/ReleasedPaymentManager";

// Off Street → Pago liberado. Root registra el importe mensual del módulo y
// activa/desactiva por estacionamiento, y supervisa; el administrador del
// estacionamiento define cupos, tarifas a sus beneficiarios y
// autorizaciones, y registra los pagos recibidos. El operador POS no accede (ver
// COMPANY_ADMIN_PREFIXES en permissions.mjs); la API valida cada acción.
export default function PagoLiberadoPage() {
  return (
    <AppShell title="Pago liberado" description="Módulo Off Street">
      <div className="space-y-6">
        <PageHeader
          title="Pago liberado"
          description="Patentes liberadas por estacionamiento: contratación y activación (ParkFacil Root, importe mensual del módulo); cupos simultáneos, tarifas a beneficiarios y autorizaciones individuales por patente y pagos recibidos de beneficiarios (administrador); historial."
        />
        <ReleasedPaymentManager />
      </div>
    </AppShell>
  );
}
