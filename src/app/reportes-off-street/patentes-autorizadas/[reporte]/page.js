"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ReportsWorkspace from "@/components/reports/engine/ReportsWorkspace";
import { flattenReports, subTree } from "@/lib/reports/engine/registry.mjs";

// Off Street → Reportes Pago liberado → <reporte> (SOL-2026-10-28-005). El árbol
// de reportes está en el menú lateral; esta página muestra el reporte elegido.
// Administrador: su empresa; Root: empresa elegida, solo lectura.
const CATEGORIES = ["off-patentes"];
const REPORT_IDS = new Set(flattenReports(subTree(CATEGORIES)).map((report) => report.id));

export default function ReportePagoLiberadoPage({ params }) {
  const { reporte } = use(params);
  if (!REPORT_IDS.has(reporte)) notFound();
  return (
    <AppShell title="Reportes Pago liberado" description="Patentes autorizadas · reportes y exportación Excel">
      <div className="space-y-6">
        <PageHeader title="Reportes Pago liberado" description="Patentes autorizadas: listados, vencimientos, historial, organizaciones y uso del beneficio, con exportación a Excel. Elige el reporte en el menú lateral." />
        <ReportsWorkspace key={reporte} initialReportId={reporte} categoryIds={CATEGORIES} hideTree />
      </div>
    </AppShell>
  );
}
