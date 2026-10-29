import { redirect } from "next/navigation";

// Reportes Pago liberado (SOL-2026-10-28-005): cada reporte tiene su ruta
// (/reportes-off-street/patentes-autorizadas/<reporte>) y se elige en el menú
// lateral. La ruta base abre el listado general.
export default function ReportesPagoLiberadoIndex() {
  redirect("/reportes-off-street/patentes-autorizadas/pl-listado");
}
