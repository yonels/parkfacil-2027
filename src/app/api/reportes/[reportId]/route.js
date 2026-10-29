import { handleReportRequest } from "@/lib/reports/engine/reportServer";

// Motor común de reportes (SOL-2026-10-28-005, E2). GET con filtros:
// periodo (hoy|ayer|semana|mes|anio|personalizado), desde, hasta, patente,
// estado, estacionamiento, companyId (solo Root) y formato=xlsx para Excel.

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { reportId } = await params;
  return handleReportRequest(request, String(reportId || "").slice(0, 60));
}
