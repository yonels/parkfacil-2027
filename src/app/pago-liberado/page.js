"use client";

import { useCallback, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ReleasedPaymentManager from "@/components/pagoLiberado/ReleasedPaymentManager";
import ReleasedPlatesManager from "@/components/pagoLiberado/ReleasedPlatesManager";

// Off Street → Pago liberado.
// - Administrador de la empresa (SOL-2026-10-28-003): activa el módulo por
//   estacionamiento y gestiona las patentes liberadas, sin ParkFacil Root.
// - Root (y cualquier rol al que la API nueva responda 403): vista anterior
//   de contratación y supervisión, hasta decidir qué pantallas se eliminan.
// El operador POS no accede (ver COMPANY_ADMIN_PREFIXES en permissions.mjs).
export default function PagoLiberadoPage() {
  const [legacy, setLegacy] = useState(false);
  const showLegacy = useCallback(() => setLegacy(true), []);
  return (
    <AppShell title="Pago liberado" description="Módulo Off Street">
      <div className="space-y-6">
        <PageHeader
          title="Pago liberado"
          description={legacy
            ? "Patentes liberadas por estacionamiento: contratación y activación (ParkFacil Root, importe mensual del módulo); cupos simultáneos, tarifas a beneficiarios y autorizaciones individuales por patente y pagos recibidos de beneficiarios (administrador); historial."
            : "Registra las patentes que pueden estacionar sin costo en tus estacionamientos con el módulo activo, durante el período que indiques. Si el vehículo sale después del término, el POS cobra solo el tiempo excedente."}
        />
        {legacy ? <ReleasedPaymentManager /> : <ReleasedPlatesManager onForbidden={showLegacy} />}
      </div>
    </AppShell>
  );
}
