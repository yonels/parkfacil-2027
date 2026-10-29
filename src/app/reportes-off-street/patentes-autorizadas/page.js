"use client";

import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ReportsWorkspace from "@/components/reports/engine/ReportsWorkspace";

// Off Street → Reportes Pago liberado (SOL-2026-10-28-005, opción B aprobada
// por el usuario): motor común de reportes limitado a A. Patentes
// Autorizadas. Administrador: su empresa; Root: empresa elegida, solo lectura.
// La página de Reportes Off Street existente no cambia.
const CATEGORIES = ["off-patentes"];

export default function ReportesPagoLiberadoPage() {
  return (
    <AppShell title="Reportes Pago liberado" description="Patentes autorizadas · reportes y exportación Excel">
      <div className="space-y-6">
        <PageHeader title="Reportes Pago liberado" description="Patentes autorizadas: listados, vencimientos, historial, organizaciones y uso del beneficio, con exportación a Excel." />
        <ReportsWorkspace categoryIds={CATEGORIES} storageKey="parkfacil.reportes.pago-liberado.ultimo" />
      </div>
    </AppShell>
  );
}
