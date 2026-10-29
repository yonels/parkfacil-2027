"use client";

import { useCallback, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ReleasedPlatesManager from "@/components/pagoLiberado/ReleasedPlatesManager";

// Off Street → Pago liberado.
// - Administrador de la empresa (SOL-2026-10-28-003): activa el módulo por
//   estacionamiento y gestiona las patentes liberadas, sin ParkFacil Root.
// - Root: la misma vista en modo supervisión de solo lectura, por empresa
//   (reemplaza la vista anterior de contratación, cupos, tarifas y pagos).
// El operador POS no accede (ver COMPANY_ADMIN_PREFIXES en permissions.mjs).
export default function PagoLiberadoPage() {
  const [forbidden, setForbidden] = useState(false);
  const onForbidden = useCallback(() => setForbidden(true), []);
  return (
    <AppShell title="Pago liberado" description="Módulo Off Street">
      <div className="space-y-6">
        <PageHeader
          title="Pago liberado"
          description="Patentes que pueden estacionar sin costo en los estacionamientos con el módulo activo, durante el período indicado. Si el vehículo sale después del término, el POS cobra solo el tiempo excedente."
        />
        {forbidden
          ? <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-600">No tienes acceso a Pago liberado.</p>
          : <ReleasedPlatesManager onForbidden={onForbidden} />}
      </div>
    </AppShell>
  );
}
