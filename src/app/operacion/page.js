import { Search, PlusCircle } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import OperacionCard from "@/components/operacion/OperacionCard";
import OperacionResumen from "@/components/operacion/OperacionResumen";
import { getOperacionesDemo, getResumenOperativo } from "@/data/operacion.mjs";

export const metadata = {
  title: "Operación diaria | ParkFacil",
  description: "Vista base de operación diaria para tickets, movimientos y resumen operativo.",
};

export default function OperacionPage() {
  const operaciones = getOperacionesDemo();
  const resumen = getResumenOperativo();

  return (
    <AppShell title="Operación diaria" description="Vista base de operación diaria para tickets y movimientos">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#3150D8]">Operación diaria</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#041E42]">Seguimiento de tickets y movimientos</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Vista base visual para operaciones de ingreso, salida y control de incidencias.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-2xl bg-[#041E42] px-4 py-3 text-sm font-semibold text-white">
            <PlusCircle className="h-4 w-4" />
            Nuevo movimiento
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <OperacionResumen title="Ingresos del día" value={resumen.ingresosDia} description="Movimientos de ingreso" tone="info" />
          <OperacionResumen title="Salidas del día" value={resumen.salidasDia} description="Movimientos de salida" tone="positive" />
          <OperacionResumen title="Tickets abiertos" value={resumen.ticketsAbiertos} description="En seguimiento" tone="warning" />
          <OperacionResumen title="Incidencias" value={resumen.ticketsObservados} description="Requieren revisión" tone="neutral" />
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#041E42]">Movimientos recientes</h2>
              <p className="mt-1 text-sm text-slate-600">Vista de referencia para monitoreo y auditoría.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Search className="h-4 w-4 text-[#3150D8]" />
              <span>Buscar ticket o patente</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            {operaciones.map((operacion) => (
              <OperacionCard key={operacion.id} operacion={operacion} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-semibold text-[#041E42]">Nota de alcance</p>
          <p className="mt-2">Esta vista es exclusivamente visual y demo-data-driven, con contenido local para proyectar la estructura del módulo sin integrar procesos operativos reales.</p>
        </div>
      </div>
    </AppShell>
  );
}
